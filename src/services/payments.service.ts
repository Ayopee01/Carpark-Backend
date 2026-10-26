// Import Repositories
import * as chargesRepository from '../repositories/charges.repository';
// Import Mappers
import { toGatewayChargeEvent } from '../repositories/mappers/charge.mapper';
// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
import * as omisePaymentService from './shared/omise-payment.service';
import * as paymentSelectionService from './shared/payment-selection.service';
import * as socketTicketService from './shared/socket-ticket.service';
// Import Types
import type { AdminChargeInput, AvailablePaymentMethod, GatewayChargeEvent, GatewayProcessResult, OmiseChargeResponse, OmiseDocumentFile } from '../types/shared/payment.type';
import type { UserApi } from '../types/shared/user.type';
// Import Validation
import { resolveRefundBodySchema, socketTicketBodySchema } from '../validation/payments.schema';
import { parseWithSchema } from '../validation/zod';
// Import Utils
import { ApiError } from '../utils/api-error';

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงเครื่อง EDC ของเคาน์เตอร์ที่ใช้ได้ ให้พนักงานเลือกเครื่องที่ใช้รับบัตร
async function listCashierEdcDevices(): Promise<{ data: { deviceId: string | null; deviceName: string; terminalId: string | undefined; location: string | null; provider: string | null }[] }> {
  const devices = await deviceRegistryService.listCashierEdcDevices();
  return {
    data: devices.map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      terminalId: device.terminalId,
      location: device.location || null,
      provider: device.provider || null,
    })),
  };
}

// Function ดึงวิธีชำระที่เปิดใช้งานของ Admin (channel cashier) บัตรแสดงเฉพาะเมื่อมีเครื่อง EDC ของเคาน์เตอร์ที่ active
async function listPaymentMethods(): Promise<{ channel: 'cashier'; methods: AvailablePaymentMethod[] }> {
  const [methods, edcDevices] = await Promise.all([paymentSelectionService.listAvailableMethods('cashier'), deviceRegistryService.listCashierEdcDevices()]);
  return { channel: 'cashier' as const, methods: methods.filter((method) => method.id !== 'card' || edcDevices.length > 0) };
}

// Function สร้าง Omise charge ของ Admin/Cashier (channel ต้องเป็น cashier)
async function createOmiseCharge(body: AdminChargeInput = {}, user?: UserApi | null): Promise<{ message: string; charge: OmiseChargeResponse }> {
  const charge = await omisePaymentService.createOmiseChargeForAdmin({
    transactionId: body.transactionId,
    plateNo: body.plateNo,
    source: body.source,
    token: body.token,
    sourceType: body.sourceType,
    method: body.method,
    channel: body.channel || 'cashier',
    amount: body.amount,
    processedBy: user?.id ?? null,
    returnUri: body.returnUri,
  });
  return { message: 'created', charge };
}

// Function ดึงรูป QR PromptPay ของ charge ที่ Admin สร้าง
async function getOmiseQrImage(query: { chargeId?: string; documentPath?: string } = {}): Promise<OmiseDocumentFile> {
  return omisePaymentService.getOmiseQrImage({ chargeId: query.chargeId, documentPath: query.documentPath });
}

// Function ตรวจสถานะ charge กับ Omise เมื่อพนักงานกดตรวจสอบ (ผลที่จ่ายแล้วส่งทาง payment WebSocket ด้วย)
async function verifyOmiseCharge(chargeId: string): Promise<{ message: string } & GatewayProcessResult> {
  const result = await omisePaymentService.verifyOmiseCharge(chargeId);
  return { message: 'Charge verified', ...result };
}

// Function ออก ticket ใช้ครั้งเดียวให้ browser ต่อ Admin payment WebSocket ของ chargeId นี้ (ผูกกับ user และ session ที่ขอ)
async function createSocketTicket(body: unknown, user?: UserApi | null, sessionId?: string | null): Promise<{ ticket: string; expiresIn: number }> {
  const { chargeId } = parseWithSchema(socketTicketBodySchema, body);
  if (!user || !sessionId) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');
  if (!(await chargesRepository.getGatewayChargeByChargeId(chargeId))) throw new ApiError(404, 'GATEWAY_CHARGE_NOT_FOUND', 'Gateway charge not found');
  return socketTicketService.issueSocketTicket({ userId: user.id, sessionId, chargeId });
}

// Function บันทึกว่า Admin คืนเงินของ charge แล้ว
async function resolveOmiseRefund(chargeId: string, body: unknown, user?: UserApi | null): Promise<{ message: string; charge: GatewayChargeEvent | null }> {
  const { note } = parseWithSchema(resolveRefundBodySchema, body);
  const charge = await omisePaymentService.resolveGatewayRefund(chargeId, { note: note || null, resolvedBy: user?.id || null });
  return { message: 'Refund resolved', charge: toGatewayChargeEvent(charge) };
}

export { createOmiseCharge, createSocketTicket, getOmiseQrImage, listCashierEdcDevices, listPaymentMethods, resolveOmiseRefund, verifyOmiseCharge };
