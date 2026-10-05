// Import Library
import type { Transaction } from '@prisma/client';
// Import Types
import type { GateAction } from './shared/transaction.type';

/* -------------------------------------- Transactions Types -------------------------------------- */

// Type ข้อมูล transaction ขั้นต่ำที่ใช้สร้าง gate response (รวมรายการสมมติเมื่อไม่พบรายการ)
export interface GateSubject {
  id: string | null;
  plateNo: string;
  status: string;
  receipt?: unknown;
}

// Type ผลตรวจว่ารถออกได้หรือไม่
export type ExitEligibility =
  | { ok: true; exitTimeLimit: string | null }
  | { ok: false; action: GateAction; message: string; paymentRequired?: boolean; reason?: string; remainingAmount?: number; exitTimeLimit?: undefined };

// Type รายการ transaction ที่เปลี่ยนไว้ emit หลัง commit
export interface TransactionChange {
  reason: string;
  transaction: Transaction;
}

// Type query ของรายการ transaction ของ Admin
export interface TransactionListQuery {
  keyword?: string;
  plate_no?: string;
  bill_no?: string;
  page?: string | number;
  per_page?: string | number;
  all?: string;
}

// Type item ของรายการ transaction ของ Admin
export interface TransactionListItem {
  id: string;
  billNo: string;
  plateNo: string;
  vehicleType: string;
  status: string;
  entryAt: string | null;
  exitAt: string | null;
  exitTimeLimit: string | null;
  isOverstay: boolean;
  amount: { net: number; paid: number; remaining: number };
  duration: { display: string; hours: number; totalMinutes: number };
  latestPayment: { paymentId: string; method: string; channel: string; paidAmount: number; paidAt: string; reference: string | null } | null;
  updatedAt: string | null;
}

// Type response หลัง Admin รับชำระเงิน
export interface AdminPaymentResponse {
  transaction: { transactionId: string; billNo: string; plateNo: string; vehicleType: string; status: string };
  payment: {
    paymentId: string;
    method: string;
    channel: string;
    paidAmount: number;
    paidAt: string;
    processedBy: string | undefined;
    reference: string | null;
    terminalId: string | null;
    edcDeviceId: string | null;
  } | null;
  amount: { netAmount: number; paidAmount: number; remainingAmount: number };
  parking: { entryAt: string | null; exitTimeLimit: string | null; isOverstay: boolean; durationDisplay: string; totalMinutes: number };
}
