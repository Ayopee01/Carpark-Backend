// Import Repositories
import * as chargesRepository from '../repositories/charges.repository';
// Import Mappers
import { toJsonArray } from '../repositories/mappers/transaction.mapper';
// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
import * as omisePaymentService from './shared/omise-payment.service';
import * as paymentSelectionService from './shared/payment-selection.service';
import * as socketTicketService from './shared/socket-ticket.service';
import * as transactionLookupService from './shared/transaction-lookup.service';
// Import Types
import type { EdcReconciliation, EdcReconciliationPayment, EdcReconciliationTerminal, ReconciliationQuery } from '../types/payments.type';
import type { SafeDevice } from '../types/shared/device.type';
import type { AdminChargeInput, AvailablePaymentMethod, GatewayChargeApi, GatewayProcessResult, OmiseChargeResponse, OmiseDocumentFile, RefundItem } from '../types/shared/payment.type';
import type { UserApi } from '../types/shared/user.type';
// Import Validation
import { resolveRefundBodySchema, socketTicketBodySchema } from '../validation/payments.schema';
import { parseWithSchema } from '../validation/zod';
// Import Utils
import { ApiError } from '../utils/api-error';
import { bangkokDateToUtcIso, getBangkokParts } from '../utils/date';
import { getPaymentAmount } from '../utils/payments';
import { roundMoney } from '../utils/pricing';

/* -------------------------------------- Config -------------------------------------- */

// Config ช่วงวันที่ยาวที่สุดของรายงานกระทบยอด EDC (วัน) กันการโหลดข้อมูลมากเกินไป
const MAX_RECONCILIATION_DAYS = 31;

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลงวันที่ YYYY-MM-DD (เวลาไทย) เป็นช่วงเริ่ม/สิ้นสุดวันแบบ UTC ISO คืน null ถ้าวันที่ไม่ถูกต้อง
function toBangkokDayRange(value: unknown): { start: string; end: string } | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year = 0, month = 1, day = 1] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { start: bangkokDateToUtcIso(year, month, day, 0, 0, 0, 0), end: bangkokDateToUtcIso(year, month, day, 23, 59, 59, 999) };
}

// Function อ่านช่วงวันที่ของรายงานจาก date หรือ start_date/end_date (ไม่ส่ง = วันนี้ตามเวลาไทย)
function parseReconciliationRange(query: ReconciliationQuery = {}): { startDate: string; endDate: string } {
  const today = getBangkokParts(new Date());
  const todayText = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  const start = toBangkokDayRange(query.start_date || query.date || todayText);
  const end = toBangkokDayRange(query.end_date || query.date || query.start_date || todayText);
  if (!start || !end || start.start > end.end) throw new ApiError(400, 'INVALID_DATE_RANGE', 'Invalid date, start_date or end_date');
  if (new Date(end.end).getTime() - new Date(start.start).getTime() > MAX_RECONCILIATION_DAYS * 24 * 60 * 60 * 1000) {
    throw new ApiError(400, 'INVALID_DATE_RANGE', `Date range must not exceed ${MAX_RECONCILIATION_DAYS} days`);
  }
  return { startDate: start.start, endDate: end.end };
}

// Function ตัดข้อมูลเครื่อง EDC ให้เหลือเฉพาะที่แสดงในรายงาน
function toEdcDeviceSummary(device: SafeDevice | undefined): EdcReconciliationTerminal['edcDevice'] {
  if (!device) return null;
  const { deviceId, deviceName, location, provider, usage } = device;
  return { deviceId, deviceName, location, provider, usage };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function สรุปรายการรับบัตรผ่านเครื่อง EDC แยกตาม terminalId ไว้เทียบกับรายงาน settlement ของเครื่อง EDC
async function getEdcReconciliation(query: ReconciliationQuery = {}): Promise<EdcReconciliation> {
  const { startDate, endDate } = parseReconciliationRange(query);
  const [rows, edcDevices] = await Promise.all([transactionLookupService.listPaymentRowsSince(startDate), deviceRegistryService.listEdcDevices()]);
  const edcByTerminalId = new Map(edcDevices.map((device) => [device.terminalId ?? '', device]));
  const payments = rows.flatMap((row) => toJsonArray(row.payments)
    .filter((payment) => payment.method === 'card' && payment.paidAt >= startDate && payment.paidAt <= endDate)
    .map((payment): EdcReconciliationPayment => ({
      transactionId: row.id,
      plateNo: row.plateNo,
      billNo: row.billNo,
      paymentId: payment.id,
      reference: (payment.reference as string | undefined) ?? null,
      terminalId: (payment.terminalId as string | undefined) ?? null,
      edcDeviceId: (payment.edcDeviceId as string | undefined) ?? null,
      amount: getPaymentAmount(payment),
      paidAt: payment.paidAt,
      channel: payment.channel,
      deviceId: (payment.deviceId as string | undefined) ?? null,
      processedBy: (payment.processedBy as string | undefined) ?? null,
    })))
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));

  const byTerminal = new Map<string, EdcReconciliationPayment[]>();
  payments.forEach((payment) => {
    const key = payment.terminalId || '';
    const items = byTerminal.get(key) ?? [];
    items.push(payment);
    byTerminal.set(key, items);
  });
  const sum = (items: EdcReconciliationPayment[]): number => roundMoney(items.reduce((total, item) => total + item.amount, 0));

  return {
    range: { startDate, endDate },
    total: { count: payments.length, amount: sum(payments) },
    // รายการที่ไม่มี reference/terminalId (บันทึกก่อนมีกฎนี้) ต้องตรวจด้วยมือ
    missingReferenceCount: payments.filter((payment) => !payment.reference).length,
    terminals: [...byTerminal.entries()].map(([terminalId, items]) => ({
      terminalId: terminalId || null,
      edcDevice: toEdcDeviceSummary(edcByTerminalId.get(terminalId)),
      channels: [...new Set(items.map((item) => item.channel))],
      deviceIds: [...new Set(items.map((item) => item.deviceId).filter((deviceId): deviceId is string => Boolean(deviceId)))],
      count: items.length,
      amount: sum(items),
      payments: items,
    })),
  };
}

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

// Function ดึงรายการเงินจาก Omise ที่ต้องคืน (status=resolved ดูรายการที่คืนแล้ว)
async function listOmiseRefunds(query: { status?: string } = {}): Promise<{ data: GatewayChargeApi[]; summary: { pendingCount: number; pendingAmount: number } }> {
  return omisePaymentService.listGatewayRefunds({ resolved: query.status === 'resolved' });
}

// Function บันทึกว่า Admin คืนเงินของ charge แล้ว
async function resolveOmiseRefund(chargeId: string, body: unknown, user?: UserApi | null): Promise<{ message: string; charge: GatewayChargeApi | null }> {
  const { note } = parseWithSchema(resolveRefundBodySchema, body);
  const charge = await omisePaymentService.resolveGatewayRefund(chargeId, { note: note || null, resolvedBy: user?.id || null });
  return { message: 'Refund resolved', charge };
}

// Function ดึง snapshot รายการรอคืนเงินที่ยังไม่คืน ใช้ตอนเปิด refund SSE ของ Admin
async function getPendingRefundsSnapshot(): Promise<{ pendingCount: number; pendingAmount: number; data: RefundItem[] }> {
  return omisePaymentService.getPendingRefundsSnapshot();
}

export { createOmiseCharge, createSocketTicket, getEdcReconciliation, getOmiseQrImage, getPendingRefundsSnapshot, listCashierEdcDevices, listOmiseRefunds, listPaymentMethods, resolveOmiseRefund, verifyOmiseCharge };
