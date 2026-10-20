// Import Library
import type { TestContext } from 'node:test';
// Import Test Helpers
import { fixture, stub } from './mock';
// Import Repositories
import * as chargesRepository from '../../src/repositories/charges.repository';
// Import Services
import * as transactionLookupService from '../../src/services/shared/transaction-lookup.service';
// Import Types
import type { PaymentRecord, TransactionApi } from '../../src/types/shared/transaction.type';

/* -------------------------------------- Types -------------------------------------- */

// Type ข้อมูล payment ที่ใช้สร้าง fixture
interface PaymentInput {
  method: string;
  channel: string;
  amount: number;
  paidAt: string;
  processedBy?: string;
  deviceType?: string;
}

// Type transaction fixture ที่ dashboard/overview ใช้
type DashboardTransaction = Pick<TransactionApi, 'id' | 'billNo' | 'plateNo' | 'status' | 'entryAt' | 'isOverstay' | 'payments'>;

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function สร้างช่วงเวลาวันนี้ตาม Bangkok time สำหรับ test
function getBangkokTodayRange(): { startDate: string; midday: string; endDate: string; yesterday: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return {
    startDate: new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0)).toISOString(),
    midday: new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0)).toISOString(),
    endDate: new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999)).toISOString(),
    yesterday: new Date(Date.UTC(year, month - 1, day - 1, 5, 0, 0, 0)).toISOString(),
  };
}

// Function สร้าง transaction fixture สำหรับ dashboard test
function transaction(id: string, { entryAt, status = 'completed', isOverstay = false, payments = [] }: { entryAt: string; status?: string; isOverstay?: boolean; payments?: PaymentRecord[] }): DashboardTransaction {
  return {
    id,
    billNo: id,
    plateNo: id,
    status,
    entryAt,
    isOverstay,
    payments,
  };
}

// Function สร้าง payment fixture สำหรับ dashboard test
function payment(id: string, { method, channel, amount, paidAt, processedBy = 'system', deviceType }: PaymentInput): PaymentRecord {
  return {
    id,
    method,
    channel,
    paidAmount: amount,
    amount,
    paidAt,
    processedBy,
    ...(deviceType ? { deviceType } : {}),
  };
}

// Function แทน listAllTransactions/listPaymentRowsSince ด้วยข้อมูล fixture (payment rows คืนทุกรายการให้ service กรอง paidAt เอง)
function mockTransactions(t: TestContext, transactions: DashboardTransaction[]): void {
  stub(t, transactionLookupService, {
    listPaymentRowsSince: async () => structuredClone(transactions),
    listAllTransactions: async (filters = {}) => {
      const rows = fixture<TransactionApi[]>(structuredClone(transactions));
      if (!filters.startDate && !filters.endDate) return rows;
      return rows.filter((item) => {
        const entryAt = new Date(item.entryAt ?? 0);
        return entryAt >= new Date(filters.startDate ?? 0) && entryAt <= new Date(filters.endDate ?? 0);
      });
    },
  });
  stub(t, chargesRepository, { summarizePendingRefunds: async () => ({ count: 1, amount: 4000 }) });
}

export { getBangkokTodayRange, mockTransactions, payment, transaction };
export type { DashboardTransaction, PaymentInput };
