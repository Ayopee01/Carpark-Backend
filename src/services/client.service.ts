// Import Repositories
import * as configRepository from '../repositories/config.repository';
// Import Mappers
import { toJsonArray } from '../repositories/mappers/transaction.mapper';
// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
import * as edcVerificationService from './shared/edc-verification.service';
import * as paymentSelectionService from './shared/payment-selection.service';
import * as omisePaymentService from './shared/omise-payment.service';
import * as transactionLookupService from './shared/transaction-lookup.service';
import * as transactionPaymentService from './shared/transaction-payment.service';
// Import Types
import type { ActivateDeviceResponse, ClientPaymentInput, ClientQuery, ClientRequestContext, ClientSource, ClientTransactionResponse, ClientType } from '../types/client.type';
import type { SafeDevice } from '../types/shared/device.type';
import type { AvailablePaymentMethod, OmiseChargeResponse, OmiseDocumentFile } from '../types/shared/payment.type';
import type { PlateLookupResult, ProcessPaymentResult, TransactionApi } from '../types/shared/transaction.type';
// Import Validation
import { CLIENT_ERROR_CODES, activateDeviceBodySchema, clientPayBodySchema, heartbeatBodySchema, plateNoInputSchema } from '../validation/client.schema';
import { parseWithSchema } from '../validation/zod';
import { clientEdcPaymentBodySchema } from '../validation/transactions.schema';
// Import Utils
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';

/* -------------------------------------- Config -------------------------------------- */

// Config payment channel ตามประเภท client (ไม่มี deviceId ถือเป็น mobile)
const CLIENT_PAYMENT_CHANNELS: Record<ClientType, string> = { barrier_gate: 'gate', kiosk: 'kiosk', mobile: 'mobile' };

// Config ประเภทอุปกรณ์ที่ใช้ client API ด้วย device credentials
const CLIENT_DEVICE_TYPES: string[] = ['kiosk', 'barrier_gate'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลง transaction เป็น response ฝั่ง client พร้อมข้อมูลแหล่งที่มาของ request
function toClientTransactionResponse(transaction: TransactionApi, source: ClientSource): ClientTransactionResponse {
  return {
    transactionId: transaction.id,
    billNo: transaction.billNo,
    plateNo: transaction.plateNo,
    vehicleType: transaction.vehicleType,
    entryAt: transaction.entryAt,
    calculatedAt: transaction.calculatedAt,
    exitTimeLimit: transaction.exitTimeLimit,
    isOverstay: transaction.isOverstay,
    status: transaction.status,
    amount: {
      netAmount: transaction.netAmount,
      paidAmount: transaction.totalPaid,
      remainingAmount: transaction.remainingAmount,
    },
    duration: {
      display: transaction.serviceDisplay,
      hours: transaction.durationHour,
      totalMinutes: transaction.totalMinutes,
    },
    feeBreakdown: transaction.feeBreakdown,
    qrData: transaction.qrData,
    clientType: source.clientType,
    device: source.device,
  };
}

// Function ตรวจว่า transaction ยังจ่ายได้ (client ห้ามจ่ายหรือดูรายการที่ปิดแล้วหรือรถออกไปแล้ว)
function assertTransactionOpen(transaction: Pick<TransactionApi, 'status' | 'exitAt'>): void {
  if (!transactionLookupService.isPayableTransaction(transaction)) {
    throw new ApiError(403, 'TRANSACTION_ALREADY_PROCESSED', 'This transaction is already processed');
  }
}

// Function กันบันทึกบัตรที่ตู้ระหว่างที่ QR ของรายการยังสแกนจ่ายได้ (ตู้ไม่มีพนักงานยืนยันแบบ confirmPendingCharge ของ Admin)
// reference นี้ถูกบันทึกในรายการแล้วคือ request ที่ส่งซ้ำ ต้องคืนผลเดิมได้ จึงไม่ตรวจ QR
async function assertNoPendingQrForEdc({ transactionId, plateNo, reference, terminalId }: { transactionId?: string; plateNo?: string; reference: string; terminalId: string }): Promise<void> {
  const transaction = await transactionLookupService.findTransactionByIdOrPlateNo(transactionId || plateNo, { payableOnly: true });
  if (!transaction) return;
  if (toJsonArray(transaction.payments).some((payment) => payment.reference === reference && (payment.terminalId ?? null) === terminalId)) return;
  await omisePaymentService.assertNoActiveGatewayCharge(transaction.id);
}

// Function สร้างชื่อผู้ทำรายการจาก client source เช่น kiosk_K-20260101-001 หรือ mobile_user
function getProcessedBy(source: ClientSource, deviceId: string | null | undefined): string {
  return deviceId ? `${source.clientType}_${deviceId}` : 'mobile_user';
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง config พื้นฐานแบบ public (theme + ชื่อระบบ) ให้ client ใช้ก่อน activate หรือ login
async function getClientConfig(): Promise<{ theme: { systemName: string | null; themeColor: string | null; logoUrl: string | null; themeMode: string; customThemeColor: string | null; updatedAt: string | null } }> {
  const [theme, systemSettings] = await Promise.all([
    configRepository.getConfig('theme'),
    configRepository.getConfig('system_settings'),
  ]);

  return {
    theme: {
      systemName: systemSettings.general?.systemName ?? null,
      themeColor: theme.themeColor ?? null,
      logoUrl: theme.logoUrl ?? null,
      themeMode: theme.themeMode ?? '',
      customThemeColor: theme.customThemeColor ?? null,
      updatedAt: theme.updatedAt || null,
    },
  };
}

// Function เปิดใช้งาน kiosk/barrier gate ด้วย activation code คืน deviceId และ deviceToken ที่แสดงครั้งเดียว
async function activateDevice(body: { code?: unknown } | null | undefined): Promise<ActivateDeviceResponse> {
  const { code } = parseWithSchema(activateDeviceBodySchema, body, { codes: CLIENT_ERROR_CODES.activate });

  const result = await deviceRegistryService.activateDeviceByCode(code);
  if (!result) throw new ApiError(400, 'INVALID_ACTIVATION_CODE', 'Invalid or expired code');

  const { device, deviceToken } = result;
  const response: Omit<ActivateDeviceResponse, 'status'> = {
    success: true,
    message: device.deviceType === 'barrier_gate' ? 'Barrier Gate activation successful' : 'Activation successful',
    deviceToken,
    deviceId: device.deviceId,
    deviceType: device.deviceType,
    deviceName: device.deviceName,
    location: device.location,
  };
  if (device.deviceType === 'barrier_gate') {
    Object.assign(response, {
      gateId: device.gateId || null,
      direction: device.direction || null,
      cameraIds: device.cameraIds || [],
      printerIds: device.printerIds || [],
    });
  }

  return { ...response, status: device.status };
}

// Function บันทึก heartbeat ของอุปกรณ์ที่ยืนยันตัวตนแล้ว (อุปกรณ์ maintenance ห้ามส่ง heartbeat)
async function recordHeartbeat(device: SafeDevice | null | undefined, body: { deviceId?: string; name?: string; location?: string } | null | undefined, ip?: string | null): Promise<{ message: string; deviceType: string; status: string; device: SafeDevice }> {
  const { deviceId } = parseWithSchema(heartbeatBodySchema, body, { codes: CLIENT_ERROR_CODES.heartbeat });
  const { name, location } = body || {};
  if (device?.status === 'maintenance') {
    throw new ApiError(403, 'DEVICE_MAINTENANCE', 'This device is currently under maintenance. Check-in is disabled.', { status: device.status });
  }

  const result = await deviceRegistryService.updateRegisteredDeviceHeartbeat(deviceId, { name, location, ip });
  if (!result?.device) throw new ApiError(401, 'INVALID_DEVICE', 'Invalid or unregistered deviceId');

  return { message: 'Check-in successful', deviceType: result.device.deviceType, status: result.device.status, device: result.device };
}

// Function ค้นหารายการจอดที่ยังจ่ายได้จากทะเบียน ถ้าเจอหลายคันคืนรายการให้ผู้ใช้เลือก
async function lookupTransaction(query: ClientQuery | null | undefined, context?: ClientRequestContext): Promise<ClientTransactionResponse | (Extract<PlateLookupResult, { matchType: 'multiple' }> & ClientSource)> {
  const { plateNo } = parseWithSchema(plateNoInputSchema, query, { codes: CLIENT_ERROR_CODES.plateNo });

  const source = await resolveClientSource(query?.deviceId, context);
  // mobile เข้าถึงรายการได้จาก QR บนตั๋ว (transactionId) เท่านั้น ทำตั๋วหายต้องค้นทะเบียนที่ Kiosk/Barrier Gate
  if (source.clientType === 'mobile') throw new ApiError(403, 'MOBILE_PLATE_LOOKUP_NOT_ALLOWED', 'Plate number lookup is only available on kiosk or barrier gate');
  const lookup = await transactionLookupService.lookupTransactionApiByPlateNo(plateNo, { payableOnly: true });
  if (lookup.matchType === 'invalid') throw new ApiError(400, 'INVALID_PLATE_NO', lookup.message);
  if (lookup.matchType === 'multiple') return { ...lookup, clientType: source.clientType, device: source.device };
  if (lookup.matchType === 'not_found' || !lookup.transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

  assertTransactionOpen(lookup.transaction);
  return toClientTransactionResponse(lookup.transaction, source);
}

// Function ดึงรายการจอดด้วย transaction id เท่านั้น (ค้นจากทะเบียนใช้ lookupTransaction ที่บังคับความยาวขั้นต่ำ)
async function getTransaction(id: string, query: ClientQuery | null | undefined, context?: ClientRequestContext): Promise<ClientTransactionResponse> {
  const source = await resolveClientSource(query?.deviceId, context);
  const transaction = await transactionLookupService.getTransactionApiById(id);
  if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

  assertTransactionOpen(transaction);
  return toClientTransactionResponse(transaction, source);
}

// Function ดึงวิธีชำระที่ใช้ได้ของ client (บัตรแสดงเฉพาะ Kiosk/Barrier Gate ที่ผูก EDC ที่ active ไว้ ไม่มี deviceId ถือเป็น mobile)
async function getPaymentMethods(query: ClientQuery | null | undefined, context?: ClientRequestContext): Promise<{ channel: string; methods: AvailablePaymentMethod[]; edc: { deviceId: string | null; deviceName: string; terminalId: string | undefined } | null; clientType: ClientType }> {
  const source = await resolveClientSource(query?.deviceId, context);
  const channel = CLIENT_PAYMENT_CHANNELS[source.clientType];
  const binding = source.clientType === 'mobile' ? { ok: false as const } : await deviceRegistryService.resolveDeviceEdc(context?.device);
  const methods = (await paymentSelectionService.listAvailableMethods(channel)).filter((method) => method.id !== 'card' || binding.ok);
  const edc = binding.ok ? { deviceId: binding.edc.deviceId, deviceName: binding.edc.deviceName, terminalId: binding.edc.terminalId } : null;
  return { channel, methods, edc, clientType: source.clientType };
}

// Function บันทึกการรับบัตรผ่านเครื่อง EDC ของ Kiosk/Barrier Gate หลังเครื่องอนุมัติ (terminalId ต้องตรงกับ EDC ที่ผูกไว้, reference ซ้ำคืนผลเดิม)
async function payByEdc({ body, deviceId, context }: ClientPaymentInput): Promise<{ message: string; duplicate: boolean; transaction: TransactionApi } & ClientSource> {
  const { transactionId, plateNo, amount, reference, terminalId } = parseWithSchema(clientEdcPaymentBodySchema, body);
  if (!deviceId) throw new ApiError(401, 'DEVICE_CREDENTIALS_REQUIRED', 'Device credentials are required');

  // ผลจากเครื่อง EDC ต้องมาจากเครื่อง EDC ที่ Admin ผูกกับอุปกรณ์นี้ไว้ (กันใช้ token ของเครื่องหนึ่งบันทึกแทนอีกเครื่อง)
  const binding = await deviceRegistryService.resolveDeviceEdc(context?.device);
  if (!binding.ok && binding.reason === 'not_configured') throw new ApiError(403, 'EDC_TERMINAL_NOT_CONFIGURED', 'EDC terminal is not configured for this device');
  if (!binding.ok) throw new ApiError(403, 'EDC_TERMINAL_UNAVAILABLE', 'EDC terminal of this device is not active');
  if (binding.edc.terminalId !== terminalId) throw new ApiError(403, 'EDC_TERMINAL_MISMATCH', 'terminalId does not match the EDC terminal of this device');
  await assertNoPendingQrForEdc({ transactionId, plateNo, reference, terminalId });

  // ตรวจ approval code กับผู้ให้บริการ EDC ถ้ามีตัวตรวจของ provider นี้ ไม่มีบันทึกเป็น unverified ให้เทียบกับ settlement ในรายงานกระทบยอด
  const verification = await edcVerificationService.verifyEdcApproval({ provider: binding.edc.provider ?? null, terminalId, reference, amount: Number(amount) });
  if (verification.status === 'rejected') {
    throw new ApiError(402, 'EDC_APPROVAL_REJECTED', 'EDC approval could not be found at the card provider', { reason: verification.reason ?? null });
  }

  const source = await resolveClientSource(deviceId, context);
  const transaction = await transactionPaymentService.processPayment(transactionId || null, {
    plateNo,
    method: 'card',
    channel: CLIENT_PAYMENT_CHANNELS[source.clientType],
    amount,
    reference,
    terminalId: binding.edc.terminalId,
    edcDeviceId: binding.edc.deviceId,
    edcVerification: verification.status,
    processedBy: getProcessedBy(source, deviceId),
    device: source.device,
  });
  if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found or not payable');

  const { duplicatePayment, ...data } = transaction;
  return { message: duplicatePayment ? 'Payment already recorded' : 'Payment received successfully', duplicate: Boolean(duplicatePayment), transaction: data, clientType: source.clientType, device: source.device };
}

// Function สร้าง Omise charge ของ client แบบ source เช่น PromptPay (source มาจาก Omise.js ฝั่ง frontend)
// mobile ต้องส่ง transactionId จาก QR บนตั๋ว (หารายการด้วย id แล้วเทียบ plateNo) kiosk/barrier gate ส่ง plateNo อย่างเดียวได้
async function createOmiseCharge({ body, deviceId, context }: ClientPaymentInput): Promise<{ message: string; charge: OmiseChargeResponse } & ClientSource> {
  const { transactionId, source, token, sourceType, method, returnUri } = (body || {}) as { transactionId?: unknown; source?: string; token?: string; sourceType?: string; method?: string; returnUri?: string };
  const { plateNo } = parseWithSchema(plateNoInputSchema, body, { codes: CLIENT_ERROR_CODES.plateNo });

  const clientSource = await resolveClientSource(deviceId, context);
  const normalizedTransactionId = typeof transactionId === 'string' ? transactionId.trim() : '';
  if (clientSource.clientType === 'mobile' && !normalizedTransactionId) throw new ApiError(400, 'TRANSACTION_ID_REQUIRED', 'transactionId is required');
  const charge = await omisePaymentService.createOmiseChargeForClient({
    transactionId: normalizedTransactionId || null,
    plateNo,
    source,
    token,
    sourceType,
    method,
    channel: CLIENT_PAYMENT_CHANNELS[clientSource.clientType],
    processedBy: getProcessedBy(clientSource, deviceId),
    returnUri,
  });

  return { message: 'Omise charge created', clientType: clientSource.clientType, device: clientSource.device, charge };
}

// Function ดึงรูป QR PromptPay ของ Omise charge ที่ยังรอจ่าย (client ส่งได้แค่ chargeId)
async function getOmiseQrImage(query: ClientQuery | null | undefined): Promise<OmiseDocumentFile> {
  return omisePaymentService.getClientOmiseQrImage({ chargeId: query?.chargeId });
}

// Function บันทึกการจ่ายเงินแบบไม่ผ่าน gateway (Dev Test) ใช้ได้เฉพาะเมื่อเปิด ENABLE_PAYMENT_SIMULATION channel มาจากที่มาของ request
async function payTransaction({ body, deviceId, context }: ClientPaymentInput): Promise<{ message: string; transaction: ProcessPaymentResult } & ClientSource> {
  if (process.env.ENABLE_PAYMENT_SIMULATION !== 'true') {
    throw new ApiError(403, 'PAYMENT_SIMULATION_DISABLED', 'Payment simulation is disabled');
  }
  // mobile บันทึกการจ่ายเองไม่ได้ (ไม่ผ่าน gateway) ต้องเป็น kiosk/barrier gate ที่ผ่าน device auth
  if (!deviceId) throw new ApiError(401, 'DEVICE_CREDENTIALS_REQUIRED', 'Device credentials are required');

  const { transactionId, plateNo, method } = parseWithSchema(clientPayBodySchema, body, { codes: CLIENT_ERROR_CODES.pay });

  const source = await resolveClientSource(deviceId, context);
  const channel = CLIENT_PAYMENT_CHANNELS[source.clientType];
  const transaction = await transactionPaymentService.processPayment(transactionId ?? null, {
    plateNo,
    method: method || (channel === 'gate' ? 'wallet' : 'qr'),
    channel,
    processedBy: getProcessedBy(source, deviceId),
    device: source.device,
  });
  if (!transaction) throw new ApiError(400, 'PAYMENT_PROCESSING_FAILED', 'Payment processing failed');

  return { message: 'Payment received successfully', transaction, clientType: source.clientType, device: source.device };
}

// Function ตรวจอุปกรณ์ก่อนเปิด client SSE และ refresh heartbeat คืน clientType (ไม่มี deviceId คือ public)
async function startClientEventSession(deviceId: string | null | undefined, { device, ip }: ClientRequestContext = {}): Promise<{ clientType: string }> {
  if (!deviceId) return { clientType: 'public' };
  if (!device) throw new ApiError(401, 'UNAUTHORIZED_DEVICE', 'Unauthorized device');
  if (device.status === 'maintenance') {
    throw new ApiError(403, 'DEVICE_MAINTENANCE', 'This device is currently under maintenance', { status: device.status });
  }

  await deviceRegistryService.updateRegisteredDeviceHeartbeat(deviceId, { ip });
  return { clientType: device.deviceType };
}

// Function ตรวจ device token และ allowedIps ซ้ำแล้ว refresh heartbeat ระหว่างเปิด client SSE
// คืน ok=false พร้อม reason เดียวกับ HTTP INVALID_DEVICE_CREDENTIALS (invalid_token, not_found, invalid_type, inactive, ip_not_allowed)
async function refreshDeviceHeartbeat(deviceId: string, deviceToken: string | null | undefined, ip?: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const result = await deviceRegistryService.verifyRegisteredDeviceToken(deviceId, deviceToken, CLIENT_DEVICE_TYPES);
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!deviceRegistryService.isRequestIpAllowed(result.device, ip)) {
      deviceRegistryService.reportDeviceIpBlocked(result.device, ip);
      return { ok: false, reason: 'ip_not_allowed' };
    }

    await deviceRegistryService.updateRegisteredDeviceHeartbeat(deviceId, { ip });
    return { ok: true };
  } catch (err) {
    // database ขัดข้องชั่วคราวไม่ควรตัด stream ของอุปกรณ์
    logger.error({ err }, 'Client event heartbeat failed');
    return { ok: true };
  }
}

// Function แยกที่มาของ request: มี deviceId ต้องผ่าน device auth แล้ว (kiosk/barrier gate) ไม่มีถือเป็น mobile
async function resolveClientSource(deviceId: string | null | undefined, { device, ip }: ClientRequestContext = {}): Promise<ClientSource> {
  if (!deviceId) return { clientType: 'mobile', device: null };
  if (!device || device.deviceId !== deviceId) throw new ApiError(401, 'DEVICE_CREDENTIALS_REQUIRED', 'Device credentials are required');
  if (!CLIENT_DEVICE_TYPES.includes(device.deviceType)) throw new ApiError(401, 'INVALID_DEVICE', 'Invalid or unregistered deviceId');
  if (device.status === 'maintenance') throw new ApiError(403, 'DEVICE_MAINTENANCE', 'Device is currently under maintenance');

  const updated = await deviceRegistryService.updateRegisteredDeviceHeartbeat(deviceId, { ip });
  const current = updated?.device || device;

  return {
    clientType: current.deviceType === 'barrier_gate' ? 'barrier_gate' : 'kiosk',
    device: {
      deviceId: current.deviceId,
      deviceType: current.deviceType,
      deviceName: current.deviceName,
      deviceLocation: current.location,
      status: current.status,
    },
  };
}

export { activateDevice, createOmiseCharge, getClientConfig, getOmiseQrImage, getPaymentMethods, getTransaction, lookupTransaction, payByEdc, payTransaction, recordHeartbeat, refreshDeviceHeartbeat, resolveClientSource, startClientEventSession };
