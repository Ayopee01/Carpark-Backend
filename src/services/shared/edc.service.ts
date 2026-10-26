// Import Library
import { addDays, isAfter } from 'date-fns';
// Import Types
import type { EdcReconciliationPayment, EdcReconciliationSummary, EdcReconciliationTerminal } from '../../types/payments.type';
import type { SafeDevice } from '../../types/shared/device.type';
import type { EdcVerificationInput, EdcVerificationResult, EdcVerifier } from '../../types/shared/payment.type';
import type { PaymentRow } from '../../types/shared/transaction.type';
// Import Utils
import { ApiError } from '../../utils/api-error';
import { inBangkok } from '../../utils/date';
import { sumMoney } from '../../utils/money';
import { getPaymentAmount } from '../../utils/revenue';
import { toJsonArray } from '../../utils/json';

/* -------------------------------------- Config -------------------------------------- */

// Config ตัวตรวจผลอนุมัติบัตรกับ host ของ EDC/acquirer แยกตาม provider ของเครื่อง EDC (ค่า provider ตัวพิมพ์เล็ก)
// ตอนนี้ยังไม่มีเครื่องและ API ของผู้ให้บริการ จึงยังว่าง เพิ่มผู้ให้บริการใหม่ได้ที่นี่โดยไม่ต้องแก้ flow การจ่ายเงิน
// ตัวตรวจคืน verified เมื่อพบรายการ, rejected เมื่อ host ตอบว่าไม่มีรายการนี้ หรือ unverified เมื่อถาม host ไม่ได้
const EDC_VERIFIERS: Record<string, EdcVerifier> = {};

// Config ช่วงวันที่ยาวที่สุดที่ส่งรายการบัตรทีละรายการได้ (วัน) กันการโหลดข้อมูลมากเกินไป
const MAX_EDC_PAYMENT_DAYS = 31;

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตัดข้อมูลเครื่อง EDC ให้เหลือเฉพาะที่แสดงในรายงาน
function toEdcDeviceSummary(device: SafeDevice | undefined): EdcReconciliationTerminal['edcDevice'] {
  if (!device) return null;
  const { deviceId, deviceName, location, provider, usage } = device;
  return { deviceId, deviceName, location, provider, usage };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจ approval code ของการรับบัตรจากอุปกรณ์กับผู้ให้บริการ EDC ก่อนบันทึก (ไม่มีตัวตรวจของ provider นี้ = unverified)
async function verifyEdcApproval(input: EdcVerificationInput): Promise<EdcVerificationResult> {
  const verifier = input.provider ? EDC_VERIFIERS[input.provider.trim().toLowerCase()] : undefined;
  if (!verifier) return { status: 'unverified' };
  return verifier(input);
}

// Function ตรวจว่าช่วงวันที่ไม่เกิน MAX_EDC_PAYMENT_DAYS ก่อนส่งรายการบัตรทีละรายการ
function assertEdcPaymentRange(startDate: string, endDate: string): void {
  if (isAfter(endDate, addDays(startDate, MAX_EDC_PAYMENT_DAYS, { in: inBangkok }))) {
    throw new ApiError(400, 'INVALID_DATE_RANGE', `Date range must not exceed ${MAX_EDC_PAYMENT_DAYS} days`);
  }
}

// Function สรุปรายการรับบัตรผ่านเครื่อง EDC ที่จ่ายในช่วงวันที่ แยกตาม terminalId ไว้เทียบกับรายงาน settlement ของเครื่อง EDC (ยอดเป็นบาท)
function summarizeEdcPayments(rows: PaymentRow[], edcDevices: SafeDevice[], startDate: string, endDate: string): EdcReconciliationSummary {
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
      edcVerification: payment.edcVerification ?? null,
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
  const sum = (items: EdcReconciliationPayment[]): number => sumMoney(items.map((item) => item.amount));

  return {
    total: { count: payments.length, amount: sum(payments) },
    // รายการที่ไม่มี reference/terminalId (บันทึกก่อนมีกฎนี้) ต้องตรวจด้วยมือ
    missingReferenceCount: payments.filter((payment) => !payment.reference).length,
    // รายการจากตู้ที่ยังไม่ได้ตรวจกับผู้ให้บริการ EDC ต้องเทียบกับ settlement ของเครื่อง EDC
    unverifiedCount: payments.filter((payment) => payment.edcVerification === 'unverified').length,
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

export { assertEdcPaymentRange, summarizeEdcPayments, verifyEdcApproval };
