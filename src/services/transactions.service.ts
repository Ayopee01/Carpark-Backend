// Import Library
import type { Prisma, Transaction } from '@prisma/client';
import type { z } from 'zod';
// Import Config
import { withTransaction } from '../db/prisma';
// Import Repositories
import * as transactionsRepository from '../repositories/transactions.repository';
// Import Mappers
import { toJsonArray, toTransactionApi } from '../repositories/mappers/transaction.mapper';
// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
import * as omisePaymentService from './shared/omise-payment.service';
import * as transactionLookupService from './shared/transaction-lookup.service';
import * as transactionPaymentService from './shared/transaction-payment.service';
// Import Types
import type { DbClient, PaginationMeta } from '../types/shared/common.type';
import type { SafeDevice } from '../types/shared/device.type';
import type { CameraReceipt, CameraTransactionDto, GateAction, GateResponseBody, GateResult, ListTransactionsInput, PaymentRecord, PlateLookupResult, TransactionApi, TransactionReceipt } from '../types/shared/transaction.type';
import type { UserApi } from '../types/shared/user.type';
import type { AdminPaymentResponse, ExitEligibility, GateSubject, TransactionChange, TransactionListItem, TransactionListQuery } from '../types/transactions.type';
// Import Validation
import { parseWithSchema } from '../validation/zod';
import { adminPaymentBodySchema, cameraTransactionBodySchema, updateTransactionBodySchema } from '../validation/transactions.schema';
// Import Utils
import { ApiError } from '../utils/api-error';
import { getBangkokDateTimeParts, parseBangkokDateTime, toDateOrNull } from '../utils/date';
import { appEvents, emitDashboardUpdated } from '../utils/events';
import { createId } from '../utils/id';
import { normalizePlateNo, normalizeVehicleType } from '../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config ช่วงเวลาที่ถือว่า event กล้องที่ส่งซ้ำเป็น event เดียวกัน
const DUPLICATE_WINDOW_MS = 10 * 1000;

// Config เวลาที่ยอมให้นาฬิกากล้องเดินเร็วกว่า server ถ้าเกินนี้ใช้เวลา server แทน
const MAX_CAPTURE_FUTURE_SKEW_MS = 5 * 60 * 1000;

// Config สถานะที่ยังต้องจ่ายเงินก่อนออกจากลาน (เมื่อยังมียอดค้าง)
const PAYMENT_REQUIRED_STATUSES = new Set<string>(['pending', 'partially_paid']);

// Config สถานะของรายการที่ยังเปิดอยู่และออกจากลานได้เมื่อไม่มียอดค้าง
const EXITABLE_STATUSES = new Set<string>(['pending', 'partially_paid', 'paid_waiting_exit']);

// Config channel ที่ Admin ส่งมาได้ตอนรับชำระเงิน (ทุกค่าบันทึกเป็น cashier)
const ADMIN_PAYMENT_CHANNELS = ['cashier', 'admin', 'ch_cashier'];

// Config ค่าของ query exact ที่ถือว่าเปิด (ค้นทะเบียนแบบตรงทุกตัวอักษร)
const EXACT_QUERY_VALUES = ['true', '1'];

// Config error ของการเลือกเครื่อง EDC ของเคาน์เตอร์ตามเหตุผลจาก device registry
const CASHIER_EDC_ERRORS: Record<'not_found' | 'not_cashier' | 'unavailable', [number, string, string]> = {
  not_found: [400, 'EDC_DEVICE_NOT_FOUND', 'edcDeviceId is not a registered EDC device'],
  not_cashier: [400, 'EDC_DEVICE_NOT_CASHIER', 'EDC device is not a cashier EDC'],
  unavailable: [409, 'EDC_DEVICE_UNAVAILABLE', 'EDC device is not active'],
};

// Config ข้อความที่แสดงที่ไม้กั้นเมื่อยังต้องจ่ายเงินตามสถานะ
const PAYMENT_REQUIRED_MESSAGES: Record<string, string> = {
  pending: 'รายการนี้ยังชำระเงินไม่ครบ กรุณาชำระเงินก่อนออก',
  partially_paid: 'หมดเวลาออกหลังชำระเงินแล้ว กรุณาชำระเงินใหม่ก่อนออก',
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function หา payment ล่าสุดของ transaction
function getLatestPayment(transaction: TransactionApi): PaymentRecord | null {
  return Array.isArray(transaction.payments) && transaction.payments.length ? transaction.payments[transaction.payments.length - 1]! : null;
}

// Function แปลง transaction เป็น item ของรายการ Admin
function toTransactionListItem(transaction: TransactionApi): TransactionListItem {
  const latestPayment = getLatestPayment(transaction);
  return {
    id: transaction.id,
    billNo: transaction.billNo,
    plateNo: transaction.plateNo,
    vehicleType: transaction.vehicleType,
    status: transaction.status,
    entryAt: transaction.entryAt,
    exitAt: transaction.exitAt,
    exitTimeLimit: transaction.exitTimeLimit,
    isOverstay: transaction.isOverstay,
    amount: { net: transaction.netAmount, paid: transaction.totalPaid, remaining: transaction.remainingAmount },
    duration: { display: transaction.serviceDisplay, hours: transaction.durationHour, totalMinutes: transaction.totalMinutes },
    latestPayment: latestPayment ? {
      paymentId: latestPayment.id,
      method: latestPayment.method,
      channel: latestPayment.channel,
      paidAmount: latestPayment.paidAmount,
      paidAt: latestPayment.paidAt,
      reference: (latestPayment.reference as string | undefined) ?? null,
    } : null,
    updatedAt: transaction.updatedAt,
  };
}

// Function แปลง transaction เป็น response หลัง Admin รับชำระเงิน
function toAdminPaymentResponse(transaction: TransactionApi): AdminPaymentResponse {
  const latestPayment = getLatestPayment(transaction);
  return {
    transaction: {
      transactionId: transaction.id,
      billNo: transaction.billNo,
      plateNo: transaction.plateNo,
      vehicleType: transaction.vehicleType,
      status: transaction.status,
    },
    payment: latestPayment ? {
      paymentId: latestPayment.id,
      method: latestPayment.method,
      channel: latestPayment.channel,
      paidAmount: latestPayment.paidAmount,
      paidAt: latestPayment.paidAt,
      processedBy: latestPayment.processedBy,
      reference: latestPayment.reference ?? null,
      terminalId: latestPayment.terminalId ?? null,
      edcDeviceId: latestPayment.edcDeviceId ?? null,
    } : null,
    amount: { netAmount: transaction.netAmount, paidAmount: transaction.totalPaid, remainingAmount: transaction.remainingAmount },
    parking: {
      entryAt: transaction.entryAt,
      exitTimeLimit: transaction.exitTimeLimit,
      isOverstay: transaction.isOverstay,
      durationDisplay: transaction.serviceDisplay,
      totalMinutes: transaction.totalMinutes,
    },
  };
}

// Function อ่าน filter ของรายการ transaction จาก query string
function getTransactionListFilters(query: TransactionListQuery = {}): ListTransactionsInput {
  const { keyword, plate_no: plateNo, bill_no: billNo, page = 1, per_page: perPage = 10, all } = query;
  return { keyword, plateNo, billNo, all: all === 'true' || all === '1', page: parseInt(String(page), 10), perPage: parseInt(String(perPage), 10) };
}

// Function อ่านเวลาที่กล้องจับภาพ (ไม่ระบุ timezone ถือเป็นเวลาไทย) ถ้าไม่มีหรือเร็วกว่า server เกินกำหนดใช้เวลา server
function resolveCapturedAt(value: unknown, now: Date = new Date()): Date {
  const captured = value === undefined || value === null ? null : parseBangkokDateTime(value);
  if (!captured) return now;
  if (captured.getTime() - now.getTime() > MAX_CAPTURE_FUTURE_SKEW_MS) {
    console.warn(`Camera capturedAt ${captured.toISOString()} is ahead of server time, using server time instead`);
    return now;
  }
  return captured;
}

// Function แปลง payload กล้องที่ผ่าน validate แล้วเป็น DTO ที่ใช้สร้าง transaction
function toCameraTransactionDto(payload: z.output<typeof cameraTransactionBodySchema>): CameraTransactionDto {
  return {
    plateNo: normalizePlateNo(payload.plateNo) ?? '',
    vehicleType: normalizeVehicleType(payload.vehicleType),
    cameraId: String(payload.cameraId).trim(),
    gateId: payload.gateId === undefined || payload.gateId === null ? null : String(payload.gateId).trim(),
    direction: String(payload.direction).trim().toUpperCase(),
    capturedAt: resolveCapturedAt(payload.capturedAt),
    imageUrl: payload.imageUrl === undefined || payload.imageUrl === null ? undefined : String(payload.imageUrl).trim(),
  };
}

// Function สร้าง response มาตรฐานของ gate/camera integration (success = ประมวลผลได้ไม่ error, openGate = ให้เปิดไม้กั้นหรือไม่)
function toGateResponse(
  transaction: GateSubject,
  action: GateAction,
  message: string,
  success: boolean,
  direction: string | undefined = (transaction.receipt as TransactionReceipt | undefined)?.camera?.direction,
  extra: Partial<GateResponseBody['data']> = {}
): GateResponseBody {
  // เปิดไม้กั้นเฉพาะ OPEN_GATE ส่วน IGNORE_* ไม่เปิด (event ซ้ำเปิดไปแล้วจาก event แรก, รายการค้างจ่ายต้องให้เจ้าหน้าที่ตรวจ)
  const openGate = action === 'OPEN_GATE';
  return {
    success,
    action,
    message,
    openGate,
    data: { transactionId: transaction.id, plateNo: transaction.plateNo, direction, status: transaction.status, openGate, ...extra },
  };
}

// Function อ่านเวลาที่กล้องจับภาพ ถ้าไม่ถูกต้องใช้เวลาปัจจุบัน
function getCapturedTime(dto: Pick<CameraTransactionDto, 'capturedAt'>): Date {
  const capturedTime = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
  return Number.isNaN(capturedTime.getTime()) ? new Date() : capturedTime;
}

// Function สร้างเลขบิลจากวันเวลาไทย พร้อม suffix กันเลขซ้ำจาก event กล้อง
function createBillNo(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const parts = getBangkokDateTimeParts(date);
  return `PK${parts.year}${pad(parts.month)}${pad(parts.day)}-${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second)}-${String(Date.now()).slice(-4)}`;
}

// Function สร้างข้อมูลกล้องที่เก็บใน receipt ของ transaction
function toCameraReceipt({ cameraId, gateId, direction, imageUrl }: CameraTransactionDto, capturedTime: Date): CameraReceipt {
  return { cameraId, gateId, direction, capturedAt: capturedTime.toISOString(), ...(imageUrl ? { imageUrl } : {}) };
}

// Function ตรวจว่ารถออกได้ หรือยังต้องจ่ายเพิ่ม (ยอดค้างคำนวณ ณ ตอนนี้ รวมค่าจอดที่เพิ่มหลังหมด exitTimeLimit)
function validateExitEligibility(transaction: TransactionApi | null): ExitEligibility {
  if (!transaction) return { ok: false, action: 'TRANSACTION_NOT_FOUND', message: 'ไม่พบรายการจอดที่ยังเปิดอยู่' };
  if (!EXITABLE_STATUSES.has(transaction.status)) {
    return { ok: false, action: 'PAYMENT_REQUIRED', message: 'รายการนี้ยังไม่พร้อมออก กรุณาตรวจสอบสถานะการชำระเงิน', paymentRequired: true, reason: transaction.status };
  }

  const remainingAmount = Number(transaction.remainingAmount ?? 0);
  if (Number.isFinite(remainingAmount) && remainingAmount > 0) {
    if (PAYMENT_REQUIRED_STATUSES.has(transaction.status)) {
      return { ok: false, action: 'PAYMENT_REQUIRED', message: PAYMENT_REQUIRED_MESSAGES[transaction.status], paymentRequired: true, reason: transaction.status, remainingAmount };
    }
    return { ok: false, action: 'PAYMENT_REQUIRED', message: 'รายการนี้ยังชำระเงินไม่ครบ กรุณาชำระเงินก่อนออก', paymentRequired: true, reason: 'remaining_amount', remainingAmount };
  }

  // ไม่มียอดค้าง (จอดฟรี หรือเลย exitTimeLimit แต่ค่าจอดยังไม่เพิ่ม) ให้ออกได้ เพราะไม่มีเงินให้จ่ายแล้ว
  const exitTimeLimit = toDateOrNull(transaction.exitTimeLimit);
  return { ok: true, exitTimeLimit: exitTimeLimit ? exitTimeLimit.toISOString() : null };
}

// Function ส่ง event lpr_detected ให้ client SSE (หน้าจอ Barrier Gate) ทั้งผลที่ผ่านและไม่ผ่าน
function emitLprDetected(dto: CameraTransactionDto, result: GateResult): GateResult {
  const data: Partial<GateResponseBody['data']> = result.body?.data || {};
  appEvents.emit('lpr_detected', {
    type: 'lpr_detected',
    success: Boolean(result.body?.success),
    openGate: Boolean(result.body?.openGate),
    action: result.body?.action || null,
    message: result.body?.message || null,
    transactionId: data.transactionId || null,
    plateNo: data.plateNo || dto.plateNo,
    vehicleType: dto.vehicleType,
    cameraId: dto.cameraId,
    gateId: dto.gateId,
    direction: data.direction || dto.direction,
    status: data.status || null,
    exitTimeLimit: data.exitTimeLimit || null,
    paymentRequired: Boolean(data.paymentRequired),
    reason: data.reason || null,
    remainingAmount: data.remainingAmount ?? 0,
    netAmount: data.netAmount ?? 0,
    totalPaid: data.totalPaid ?? 0,
    checkedAt: data.checkedAt || new Date().toISOString(),
    capturedAt: data.capturedAt || getCapturedTime(dto).toISOString(),
    emittedAt: new Date().toISOString(),
  });
  return result;
}

// Function หา event กล้องเดียวกันที่ถูกส่งซ้ำภายในช่วงเวลาสั้น ๆ
async function findDuplicateCameraTransaction({ plateNo, cameraId, direction, capturedAt }: CameraTransactionDto, connection?: DbClient): Promise<Transaction | null> {
  if (!plateNo || !cameraId || !direction) return null;

  const capturedTime = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const rows = await transactionsRepository.listRecentTransactionsByPlateNo(plateNo, 20, connection);
  return rows.find((row) => {
    const camera: Partial<CameraReceipt> = (row.receipt as TransactionReceipt | null)?.camera || {};
    const cameraCapturedAt = camera.capturedAt ? new Date(camera.capturedAt) : null;
    const isSameEventTime = cameraCapturedAt ? Math.abs(cameraCapturedAt.getTime() - capturedTime.getTime()) <= DUPLICATE_WINDOW_MS : false;
    return camera.cameraId === cameraId && camera.direction === direction && isSameEventTime;
  }) || null;
}

// Function ปิดรายการที่จ่ายครบแล้วแต่ไม่มี event ขาออก (ถือว่าออกภายใน exitTimeLimit หรือก่อนเข้ารอบใหม่)
async function closeMissedExitTransaction(open: Transaction, capturedTime: Date, connection?: DbClient): Promise<Transaction> {
  const exitTimeLimit = toDateOrNull(open.exitTimeLimit);
  return transactionsRepository.updateTransactionRecord(open.id, {
    status: 'completed',
    exitAt: exitTimeLimit && exitTimeLimit < capturedTime ? exitTimeLimit : capturedTime,
    receipt: { ...((open.receipt as TransactionReceipt | null) || {}), closedReason: 'missed_exit_event' } as unknown as Prisma.InputJsonValue,
  }, connection);
}

// Function ตัดสินผล event กล้องใน database transaction คืน result ของ gate และรายการที่เปลี่ยนไว้ emit หลัง commit
async function decideCameraTransaction(dto: CameraTransactionDto, connection: DbClient): Promise<{ result: GateResult; changes: TransactionChange[] }> {
  const duplicate = await findDuplicateCameraTransaction(dto, connection);
  if (duplicate) {
    return { result: { statusCode: 200, body: toGateResponse(duplicate, 'IGNORE_DUPLICATE', 'รายการนี้ถูกส่งเข้ามาซ้ำในช่วงเวลาสั้น ๆ', true) }, changes: [] };
  }

  const open = await transactionsRepository.findOpenTransactionByPlateNo(dto.plateNo, connection);
  const capturedTime = getCapturedTime(dto);
  const camera = toCameraReceipt(dto, capturedTime);

  if (dto.direction === 'IN') {
    // รายการที่ยังค้างจ่ายต้องจ่ายก่อน ส่วนรายการที่จ่ายครบแล้วแต่ยังเปิดอยู่แปลว่ากล้องขาออกพลาด event
    if (open && open.status !== 'paid_waiting_exit') {
      const body = toGateResponse(open, 'IGNORE_ACTIVE_TRANSACTION', 'ทะเบียนนี้มีรายการจอดที่ยังไม่เสร็จสิ้นอยู่แล้ว', true, dto.direction);
      return { result: { statusCode: 200, body }, changes: [] };
    }

    const changes: TransactionChange[] = [];
    if (open) changes.push({ reason: 'camera_transaction_updated', transaction: await closeMissedExitTransaction(open, capturedTime, connection) });
    const saved = await transactionsRepository.createTransactionRecord({
      id: createId('t'),
      billNo: createBillNo(capturedTime),
      plateNo: dto.plateNo,
      vehicleType: normalizeVehicleType(dto.vehicleType),
      serviceType: 'parking',
      entryAt: capturedTime,
      exitAt: null,
      status: 'pending',
      totalPaid: 0,
      payments: [],
      receipt: { camera } as unknown as Prisma.InputJsonValue,
    }, connection);
    changes.push({ reason: 'camera_transaction_created', transaction: saved });
    return { result: { statusCode: 201, body: toGateResponse(saved, 'OPEN_GATE', 'บันทึกรายการจากกล้องสำเร็จ', true) }, changes };
  }

  const activeTransaction = open ? await transactionLookupService.getTransactionApiById(open.id, connection) : null;
  const checkedAt = new Date();
  const eligibility = validateExitEligibility(activeTransaction);
  if (!eligibility.ok || !open || !activeTransaction) {
    const failed = eligibility.ok ? { action: 'TRANSACTION_NOT_FOUND' as const, message: 'ไม่พบรายการจอดที่ยังเปิดอยู่' } : eligibility;
    const body = toGateResponse(
      activeTransaction || { id: null, plateNo: dto.plateNo, status: 'not_found', receipt: { camera: { direction: dto.direction } } },
      failed.action,
      failed.message,
      false,
      dto.direction,
      {
        exitTimeLimit: null,
        capturedAt: capturedTime.toISOString(),
        checkedAt: checkedAt.toISOString(),
        paymentRequired: 'paymentRequired' in failed ? Boolean(failed.paymentRequired) : false,
        reason: ('reason' in failed ? failed.reason : null) || null,
        remainingAmount: ('remainingAmount' in failed ? failed.remainingAmount : undefined) ?? activeTransaction?.remainingAmount ?? null,
        netAmount: activeTransaction?.netAmount ?? null,
        totalPaid: activeTransaction?.totalPaid ?? null,
      }
    );
    return { result: { statusCode: 200, body }, changes: [] };
  }

  const updated = await transactionsRepository.updateTransactionRecord(open.id, {
    exitAt: capturedTime,
    status: 'completed',
    // เก็บค่าจอดตอนปิดรายการ ให้ยอดย้อนหลังไม่เปลี่ยนตามราคาที่แก้ทีหลัง
    amount: activeTransaction.netAmount,
    netAmount: activeTransaction.netAmount,
    receipt: { ...((open.receipt as TransactionReceipt | null) || {}), camera } as unknown as Prisma.InputJsonValue,
  }, connection);
  return {
    result: { statusCode: 201, body: toGateResponse(updated, 'OPEN_GATE', 'บันทึกรายการจากกล้องสำเร็จ', true) },
    changes: [{ reason: 'camera_transaction_updated', transaction: updated }],
  };
}

// Function หา transaction ล่าสุดของทะเบียน (ตรงทั้งหมด) ที่ต้องมีอยู่ ถ้าไม่พบ throw TRANSACTION_NOT_FOUND
async function requireLatestTransactionByPlateNo(plateNo: string): Promise<Transaction> {
  const transaction = await transactionsRepository.findLatestExactTransactionByPlateNo(plateNo);
  if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Not found');
  return transaction;
}

// Function กันรับเงินช่องทางอื่นระหว่างที่ QR ของรายการยังสแกนจ่ายได้ (PromptPay ยกเลิกผ่าน Omise ไม่ได้)
async function assertNoActiveGatewayCharge(plateNo: string): Promise<void> {
  const transaction = await transactionsRepository.findLatestExactTransactionByPlateNo(plateNo, { payableOnly: true });
  if (!transaction) return;

  const charge = await omisePaymentService.findActiveGatewayCharge(transaction.id);
  if (!charge) return;
  throw new ApiError(409, 'PENDING_GATEWAY_CHARGE', 'A QR payment is still pending for this transaction', {
    chargeId: charge.chargeId,
    method: charge.method,
    channel: charge.channel,
    amount: charge.amount,
    expiresAt: charge.expiresAt,
  });
}

// Function ตรวจเครื่อง EDC ของเคาน์เตอร์ที่ Admin เลือกสำหรับรับบัตร (ต้องมี reference และ edcDeviceId) คืนข้อมูลเครื่อง EDC
async function requireCashierEdc({ reference, edcDeviceId }: { reference?: string | null; edcDeviceId?: string | null }): Promise<SafeDevice> {
  if (!reference) throw new ApiError(400, 'PAYMENT_REFERENCE_REQUIRED', 'reference (EDC approval code) is required for card payments');
  if (!edcDeviceId) throw new ApiError(400, 'EDC_DEVICE_REQUIRED', 'edcDeviceId is required for card payments');

  const result = await deviceRegistryService.getCashierEdc(edcDeviceId);
  if (!result.ok) {
    const [statusCode, code, message] = CASHIER_EDC_ERRORS[result.reason];
    throw new ApiError(statusCode, code, message);
  }
  return result.edc;
}

// Function แก้ไข field ของ transaction ล่าสุดของทะเบียน (รายการที่ปิดแล้วเปลี่ยนสถานะไม่ได้)
async function updateTransactionByPlateNo(plateNo: string, body: unknown = {}): Promise<TransactionApi> {
  const updates = parseWithSchema(updateTransactionBodySchema, body);
  const transaction = await requireLatestTransactionByPlateNo(plateNo);
  const context = await transactionLookupService.getTransactionContext();
  const isClosed = transactionsRepository.TERMINAL_TRANSACTION_STATUSES.includes(transaction.status);
  if (updates.status !== undefined && updates.status !== transaction.status && isClosed) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Closed transaction status cannot be changed');
  }

  const data: Prisma.TransactionUpdateInput = {};
  if (updates.plateNo !== undefined) {
    data.plateNo = normalizePlateNo(updates.plateNo) ?? updates.plateNo;
    const open = isClosed ? null : await transactionsRepository.findOpenTransactionByPlateNo(data.plateNo);
    if (open && open.id !== transaction.id) throw new ApiError(409, 'ACTIVE_TRANSACTION_EXISTS', 'An active transaction already exists for this plate');
  }
  if (updates.vehicleType !== undefined) data.vehicleType = updates.vehicleType;
  if (updates.serviceType !== undefined) data.serviceType = updates.serviceType;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.totalPaid !== undefined) data.totalPaid = updates.totalPaid;
  if (updates.payments !== undefined) data.payments = updates.payments as Prisma.InputJsonValue;
  if (updates.exitTimeLimit !== undefined) data.exitTimeLimit = updates.exitTimeLimit;
  if (updates.exitAt !== undefined) data.exitAt = updates.exitAt;

  if (data.status === 'completed' && !isClosed) {
    // ปิดรายการด้วยมือ: ใช้เวลาปัจจุบันเป็นเวลาออกถ้าไม่ได้ส่งมา และเก็บค่าจอดตอนปิดไว้
    const netAmount = toTransactionApi(transaction, context).netAmount;
    if (!transaction.exitAt && data.exitAt === undefined) data.exitAt = new Date();
    data.amount = netAmount;
    data.netAmount = netAmount;
  }

  const saved = await transactionsRepository.updateTransactionRecord(transaction.id, data);
  emitDashboardUpdated('transaction_updated', saved);
  return toTransactionApi(saved, context);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงรายการ transaction ของ Admin พร้อม pagination
async function listTransactions(query: TransactionListQuery): Promise<{ data: TransactionListItem[]; meta: (PaginationMeta | { all: true; total: number; totalFound: number }) & { realtime: true } }> {
  const result = await transactionLookupService.listTransactions(getTransactionListFilters(query));
  return { data: result.data.map((transaction) => toTransactionListItem(transaction)), meta: { ...result.meta, realtime: true } };
}

// Function รับ event จากกล้อง LPR: validate, ตรวจกล้องกับ Barrier Gate mapping แล้วสร้าง/ปิด transaction
async function handleCameraTransaction(body: unknown, device?: SafeDevice | null): Promise<GateResult> {
  const payload = parseWithSchema(cameraTransactionBodySchema, body, {
    message: 'ข้อมูลไม่ถูกต้อง',
    details: { success: false, action: 'VALIDATION_ERROR' },
  });
  const dto = toCameraTransactionDto(payload);

  if (device?.deviceType === 'camera' && dto.cameraId !== device.deviceId) {
    throw new ApiError(400, 'CAMERA_ID_MISMATCH', 'cameraId must match authenticated camera deviceId', { success: false, action: 'CAMERA_ID_MISMATCH' });
  }

  const binding = await deviceRegistryService.validateCameraGateBinding(dto);
  if (!binding.ok) {
    throw new ApiError(binding.statusCode || 400, 'CAMERA_GATE_VALIDATION_ERROR', binding.message, {
      success: false,
      action: 'CAMERA_GATE_VALIDATION_ERROR',
      reason: binding.reason,
    });
  }

  return createTransactionFromCamera({ ...dto, gateId: dto.gateId || binding.barrierGate.gateId || null });
}

// Function ดึง transaction ล่าสุดจากทะเบียน exact=true หาเฉพาะทะเบียนที่ตรงทุกตัวอักษร (ไม่เจอ = 404) ไม่งั้นค้นบางส่วนและคืนรายการให้เลือกเมื่อเจอหลายคัน
async function getTransactionByPlateNo(plateNo: string, { exact }: { exact?: unknown } = {}): Promise<TransactionApi | Extract<PlateLookupResult, { matchType: 'multiple' }>> {
  if (EXACT_QUERY_VALUES.includes(String(exact))) {
    if (!normalizePlateNo(plateNo)) throw new ApiError(400, 'INVALID_PLATE_NO', 'plateNo is required');
    const transaction = await transactionLookupService.getLatestExactTransactionApiByPlateNo(plateNo);
    if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Not found');
    return transaction;
  }

  const lookup = await transactionLookupService.lookupTransactionApiByPlateNo(plateNo);
  if (lookup.matchType === 'invalid') throw new ApiError(400, 'INVALID_PLATE_NO', lookup.message);
  if (lookup.matchType === 'multiple') return lookup;
  if (lookup.matchType === 'not_found' || !lookup.transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Not found');
  return lookup.transaction;
}

// Function รับชำระเงินจาก Admin ด้วยทะเบียนใน path (channel cashier เสมอ, บัตรต้องมี reference และเครื่อง EDC ของเคาน์เตอร์, confirmPendingCharge=true รับเงินทั้งที่มี QR ค้าง)
async function payTransactionByPlateNo(pathPlateNo: string, body: unknown = {}, user?: UserApi | null): Promise<{ message: string; data: AdminPaymentResponse }> {
  const { method, channel, amount, deviceId, deviceName, deviceLocation, reference, edcDeviceId, confirmPendingCharge } = parseWithSchema(adminPaymentBodySchema, body);
  if (channel && !ADMIN_PAYMENT_CHANNELS.includes(channel.trim().toLowerCase())) {
    throw new ApiError(400, 'ADMIN_CHANNEL_MUST_BE_CASHIER', 'Admin payment channel must be cashier');
  }
  const edc = method === 'card' ? await requireCashierEdc({ reference, edcDeviceId }) : null;
  if (confirmPendingCharge !== true) await assertNoActiveGatewayCharge(pathPlateNo);

  const transaction = await transactionPaymentService.processPaymentByPlateNo(pathPlateNo, {
    method,
    channel: 'cashier',
    source: 'admin',
    amount,
    reference: reference || null,
    terminalId: edc?.terminalId || null,
    edcDeviceId: edc?.deviceId || null,
    processedBy: user?.id ?? null,
    device: deviceId ? { deviceId, deviceType: 'admin', deviceName, deviceLocation } : null,
  });
  if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');

  return { message: 'Payment confirmed successfully', data: toAdminPaymentResponse(transaction) };
}

// Function แก้ไข transaction แล้วคืนข้อความสำเร็จพร้อม transaction
async function updateTransaction(plateNo: string, body: unknown): Promise<{ message: string; transaction: TransactionApi }> {
  return { message: 'Updated successfully', transaction: await updateTransactionByPlateNo(plateNo, body) };
}

// Function ลบ transaction ล่าสุดของทะเบียน (รายการที่มีการชำระเงินแล้วลบไม่ได้ ให้เปลี่ยนสถานะเป็น cancelled แทน)
async function deleteTransactionByPlateNo(plateNo: string): Promise<{ message: string }> {
  const transaction = await requireLatestTransactionByPlateNo(plateNo);
  if (toJsonArray(transaction.payments).length || Number(transaction.totalPaid ?? 0) > 0) {
    throw new ApiError(409, 'TRANSACTION_HAS_PAYMENTS', 'Transaction with payments cannot be deleted, cancel it instead');
  }

  await transactionsRepository.deleteTransactionRecord(transaction.id);
  emitDashboardUpdated('transaction_deleted', transaction);
  return { message: 'Deleted successfully' };
}

// Function สร้างหรือปิด transaction จาก DTO กล้อง LPR คืน statusCode และ body สำหรับ gate integration
async function createTransactionFromCamera(dto: CameraTransactionDto): Promise<GateResult> {
  const { result, changes } = await withTransaction(async (connection) => {
    // ล็อกตามทะเบียน ให้ event ของรถคันเดียวกันทำทีละ request (กัน IN พร้อมกันสร้างรายการเปิดซ้ำ)
    await transactionsRepository.lockPlateNo(dto.plateNo, connection);
    return decideCameraTransaction(dto, connection);
  });
  changes.forEach(({ reason, transaction }) => emitDashboardUpdated(reason, transaction));
  return emitLprDetected(dto, result);
}

export { createTransactionFromCamera, deleteTransactionByPlateNo, getTransactionByPlateNo, handleCameraTransaction, listTransactions, payTransactionByPlateNo, toCameraTransactionDto, updateTransaction };
