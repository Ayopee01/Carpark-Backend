// Import Types
import type { PaymentRecord, ReportChannel, ReportPayment, RevenueSummary, TransactionWithPayments } from '../types/shared/transaction.type';
// Import Utils
import { roundMoney } from './pricing';

/* -------------------------------------- Config -------------------------------------- */

// Config channel ที่ใช้แยกยอดในรายงาน (cashier หมายถึง Admin)
const REPORT_CHANNELS: readonly ReportChannel[] = ['cashier', 'kiosk', 'gate', 'mobile'];

// Config method ที่นับเป็นการสแกนจ่าย (PromptPay/QR)
const SCAN_METHODS = ['promptpay', 'qr', 'qr_code'];

// Config สถานะ transaction ที่จ่ายครบแล้ว
const PAID_STATUSES = ['paid_waiting_exit', 'completed'];

// Config สถานะ transaction ที่ยังค้างจ่าย
const PENDING_STATUSES = ['pending', 'partially_paid'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจว่าเวลาอยู่ในช่วงวันที่ที่กำหนด
function isDateInRange(value: unknown, startDate: string, endDate: string): boolean {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime()) && date >= new Date(startDate) && date <= new Date(endDate);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function อ่านจำนวนเงินของ payment (ไม่มีหรือไม่ถูกต้องนับเป็น 0)
function getPaymentAmount(payment: Partial<PaymentRecord> | null | undefined): number {
  const amount = Number(payment?.paidAmount ?? payment?.amount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

// Function หา channel ของ payment สำหรับรายงาน จาก channel ที่บันทึกไว้ (ไม่มี channel ให้เดาจาก method)
function getPaymentChannel(payment: Partial<PaymentRecord> | null | undefined): ReportChannel {
  const method = String(payment?.method || '').trim().toLowerCase();
  const savedChannel = String(payment?.channel || '').trim().toLowerCase();
  const channel = (REPORT_CHANNELS as readonly string[]).includes(savedChannel)
    ? savedChannel
    : [...SCAN_METHODS, 'epay', 'transfer'].includes(method) ? 'mobile' : 'cashier';

  if (channel === 'cashier') return 'cashier';
  if (payment?.deviceType === 'kiosk' || channel === 'kiosk') return 'kiosk';
  if (payment?.deviceType === 'barrier_gate' || channel === 'gate') return 'gate';
  return 'mobile';
}

// Function ตรวจว่าเป็นการสแกนจ่าย (PromptPay/QR)
function isScanPayment(payment: Partial<PaymentRecord> | null | undefined): boolean {
  return SCAN_METHODS.includes(String(payment?.method || '').trim().toLowerCase());
}

// Function ตรวจว่าเป็นเงินสดที่ Admin/cashier รับ
function isCashierCashPayment(payment: Partial<PaymentRecord>): boolean {
  return getPaymentChannel(payment) === 'cashier' && String(payment?.method || '').trim().toLowerCase() === 'cash';
}

// Function ดึง payment ทุกรายการที่จ่ายในช่วงวันที่ (รวม transaction ที่ overstay และที่จ่ายบางส่วน)
function listPaymentsPaidBetween(transactions: TransactionWithPayments[], startDate: string, endDate: string): ReportPayment[] {
  return transactions
    .flatMap((transaction) => (Array.isArray(transaction?.payments) ? (transaction.payments as PaymentRecord[]) : []).map((payment) => ({ ...payment, transactionId: transaction.id })))
    .filter((payment) => isDateInRange(payment.paidAt, startDate, endDate));
}

// Function สรุปรายได้จาก payment: ยอดรวม, เงินสดของเจ้าหน้าที่, สแกนจ่าย และแยกตาม channel
function summarizeRevenue(payments: Partial<PaymentRecord>[]): RevenueSummary {
  const sum = (items: Partial<PaymentRecord>[]): number => roundMoney(items.reduce((total, payment) => total + getPaymentAmount(payment), 0));
  const byChannel = Object.fromEntries(REPORT_CHANNELS.map((channel) => {
    const channelPayments = payments.filter((payment) => getPaymentChannel(payment) === channel);
    return [channel, { amount: sum(channelPayments), count: channelPayments.length }];
  })) as RevenueSummary['byChannel'];

  return {
    total: sum(payments),
    staff: sum(payments.filter(isCashierCashPayment)),
    scan: sum(payments.filter(isScanPayment)),
    byChannel,
  };
}

// Function นับจำนวนบัตร, ที่จ่ายครบแล้ว และที่ยังค้างจ่าย จาก transaction ที่เข้าในช่วงวันที่
function summarizeTickets(transactions: { status: string }[]): { totalTickets: number; paidCount: number; pendingCount: number } {
  return {
    totalTickets: transactions.length,
    paidCount: transactions.filter((transaction) => PAID_STATUSES.includes(transaction.status)).length,
    pendingCount: transactions.filter((transaction) => PENDING_STATUSES.includes(transaction.status)).length,
  };
}

// Function คำนวณเปอร์เซ็นต์ของยอดเทียบยอดรวม (ปัดเป็นจำนวนเต็ม)
function getPercent(amount: number, total: number): number {
  return total > 0 ? Math.round((amount / total) * 100) : 0;
}

export { getPaymentAmount, getPaymentChannel, getPercent, isScanPayment, listPaymentsPaidBetween, summarizeRevenue, summarizeTickets };
