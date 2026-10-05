// Import Library
import type { Transaction } from '@prisma/client';
// Import Types
import type { PaymentRecord, PlateCandidate, PlateCandidateRow, TransactionApi, TransactionApiContext } from '../../types/shared/transaction.type';
// Import Utils
import { getBangkokDateTimeParts, toIsoOrNull } from '../../utils/date';
import { calculateFee, roundMoney } from '../../utils/pricing';

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลงค่าเป็น number คืน null ถ้าแปลงไม่ได้
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function บังคับค่า JSON ให้เป็น array
function toJsonArray<T = PaymentRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

// Function แปลง transaction record เป็น API response พร้อมคำนวณค่าจอด ณ ปัจจุบันจาก pricing config
function toTransactionApi(row: Transaction, context?: TransactionApiContext): TransactionApi;
function toTransactionApi(row: Transaction | null, context?: TransactionApiContext): TransactionApi | null;
function toTransactionApi(row: Transaction | null, context: TransactionApiContext = {}): TransactionApi | null {
  if (!row) return null;
  const pricingRules = context.pricingConfig?.pricingRules || [];
  const entryAt = toIsoOrNull(row.entryAt);
  const now = new Date();
  let cutoffAt: string = toIsoOrNull(row.exitAt) ?? '';
  let isOverstay = false;
  const payments = toJsonArray<PaymentRecord>(row.payments);
  const exitTimeLimit = toIsoOrNull(row.exitTimeLimit);

  if (!cutoffAt && exitTimeLimit && now > new Date(exitTimeLimit)) {
    isOverstay = true;
    cutoffAt = now.toISOString();
  } else if (!cutoffAt) {
    if (['completed', 'paid_waiting_exit'].includes(row.status) && payments.length > 0) {
      const latestPayment = [...payments].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
      cutoffAt = latestPayment!.paidAt;
    } else {
      cutoffAt = now.toISOString();
    }
  }

  const feeResult = calculateFee(entryAt, cutoffAt, pricingRules, { vehicleType: row.vehicleType });

  // รายการที่รถออกแล้วใช้ค่าจอดที่บันทึกไว้ตอนปิด ไม่คำนวณใหม่ด้วยราคาปัจจุบัน (ยังไม่มีค่าบันทึกใช้ค่าที่คำนวณ)
  const storedNetAmount = toNumberOrNull(row.netAmount);
  const netAmount = row.exitAt && storedNetAmount !== null && storedNetAmount > 0 ? storedNetAmount : feeResult.totalAmount;
  const totalPaid = Number(row.totalPaid ?? 0);
  const storedAmount = toNumberOrNull(row.amount);
  const remainingAmount = roundMoney(Math.max(0, netAmount - totalPaid));
  let finalStatus = row.status;
  if (row.status === 'cancelled') {
    finalStatus = 'cancelled';
  } else if (row.exitAt) {
    finalStatus = 'completed';
  } else if (remainingAmount > 0) {
    finalStatus = totalPaid > 0 ? 'partially_paid' : 'pending';
  } else if (totalPaid > 0 || payments.length > 0) {
    finalStatus = 'paid_waiting_exit';
  }

  // วันที่แสดงเป็นเวลาไทยเสมอ ไม่ขึ้นกับ timezone ของ server
  const entryParts = getBangkokDateTimeParts(entryAt);
  const dateFormatted = `${String(entryParts.day).padStart(2, '0')}-${String(entryParts.month).padStart(2, '0')}-${entryParts.year}`;

  const durationMs = feeResult.durationMs;
  const hrs = Math.floor(durationMs / (1000 * 60 * 60));
  const mins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const durationFormatted = `${hrs} : ${mins}`;

  return {
    id: row.id,
    billNo: row.billNo,
    plateNo: row.plateNo,
    vehicleType: row.vehicleType,
    entryAt,
    exitAt: toIsoOrNull(row.exitAt),
    calculatedAt: cutoffAt,
    exitTimeLimit,
    isOverstay,
    status: finalStatus,
    baseAmount: storedAmount !== null && storedAmount > 0 ? storedAmount : netAmount,
    netAmount,
    totalPaid,
    remainingAmount,
    serviceDisplay: `${dateFormatted} | ${durationFormatted}`,
    durationHour: feeResult.totalHours,
    totalMinutes: Math.floor(durationMs / 60000),
    feeBreakdown: feeResult.breakdown,
    payments: payments.map((payment) => ({
      ...payment,
      paidAmount: toNumberOrNull(payment.amount ?? payment.paidAmount) ?? 0,
    })),
    qrData: `${context.systemSettings?.general?.frontendUrl || ''}/payment?tx=${row.id}`,
    createdAt: toIsoOrNull(row.createdAt) || entryAt,
    updatedAt: toIsoOrNull(row.updatedAt) || toIsoOrNull(row.exitAt) || entryAt,
  };
}

// Function แปลง transaction record เป็นตัวเลือกทะเบียนให้ผู้ใช้เลือกเมื่อค้นหาเจอหลายคัน
function toPlateCandidate(row: PlateCandidateRow): PlateCandidate {
  return {
    plateNo: row.plateNo,
    billNo: row.billNo,
    vehicleType: row.vehicleType,
    status: row.status,
    entryAt: toIsoOrNull(row.entryAt),
    exitAt: toIsoOrNull(row.exitAt),
    exitTimeLimit: toIsoOrNull(row.exitTimeLimit),
  };
}

export { toJsonArray, toPlateCandidate, toTransactionApi };
