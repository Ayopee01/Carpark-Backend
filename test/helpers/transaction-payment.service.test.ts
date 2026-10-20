// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
// Import Test Helpers
import { stub } from '../support/mock';
// Import Config
import { prisma } from '../../src/db/prisma';
// Import Repositories
import * as transactionsRepository from '../../src/repositories/transactions.repository';
// Import Services
import * as paymentSelectionService from '../../src/services/shared/payment-selection.service';
import * as transactionLookupService from '../../src/services/shared/transaction-lookup.service';
import * as transactionPaymentService from '../../src/services/shared/transaction-payment.service';
// Import Types
import type { PaymentRecord } from '../../src/types/shared/transaction.type';

/* -------------------------------------- Types -------------------------------------- */

// Type ข้อมูลที่ processPayment ส่งให้ updateTransactionRecord
interface SavedUpdate {
  totalPaid?: number;
  status?: string;
  exitAt?: Date;
  exitTimeLimit?: Date;
  payments?: PaymentRecord[];
}

// Type ผลที่ mock เก็บไว้ตรวจ
interface SavedPayment {
  data: SavedUpdate | null;
  selections: [string, string][];
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function จำลอง transaction ที่เข้า 08:30 และจ่ายตอน 10:00 (ค่าจอด 2 ชั่วโมง x 30 = 60) คืน update ที่ถูกบันทึก
function mockOpenTransaction(t: TestContext, { totalPaid = 0 }: { totalPaid?: number } = {}): SavedPayment {
  // ตรึงเวลาไว้กลางวัน เพื่อไม่ให้ผลเปลี่ยนเมื่อรัน test ใกล้เที่ยงคืน
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-05-04T10:00:00+07:00') });
  const selections: [string, string][] = [];
  const saved: SavedPayment = { data: null, selections };
  const row = { id: 't_1', plateNo: 'ABC1234', vehicleType: 'car', entryAt: new Date('2026-05-04T08:30:00+07:00'), totalPaid, payments: [], status: 'pending' };
  stub(t, prisma, { $transaction: async (callback) => callback(prisma) });
  stub(t, transactionLookupService, {
    getTransactionContext: async () => ({
      pricingConfig: { pricingRules: [{ feeType: 'base_hour', vehicleType: 'car', hourStart: 1, hourEnd: 24, price: 30, status: 'active' }] },
      systemSettings: { receipt: { paymentBill: { expiryDuration: 15 } } },
    }),
    findTransactionByIdOrPlateNo: async () => row,
  });
  stub(t, paymentSelectionService, { assertPaymentSelection: async (channel, method) => selections.push([channel, method]) });
  stub(t, transactionsRepository, {
    lockTransactionById: async () => row,
    lockPaymentReference: async () => {},
    findTransactionIdByPaymentReference: async () => null,
    updateTransactionRecord: async (id, data) => {
      saved.data = data as SavedUpdate;
      return { ...row, ...data };
    },
  });
  return saved;
}

/* -------------------------------------- Tests -------------------------------------- */

test('pays the remaining amount when no amount is sent', async (t) => {
  const saved = mockOpenTransaction(t);

  await transactionPaymentService.processPayment('t_1', { method: 'cash', channel: 'cashier', processedBy: 'u_admin' });

  assert.equal(saved.data?.totalPaid, 60);
  assert.equal(saved.data?.status, 'paid_waiting_exit');
});

test('rejects an amount above the remaining amount but records gateway-collected money as is', async (t) => {
  const saved = mockOpenTransaction(t);

  await assert.rejects(transactionPaymentService.processPayment('t_1', { method: 'cash', channel: 'cashier', amount: 100 }), { code: 'AMOUNT_EXCEEDS_REMAINING' });
  assert.deepEqual(saved.selections, [['cashier', 'cash']]);

  // เงินที่ Omise เก็บไปแล้วต้องบันทึกตามจริง และไม่ตรวจ payment settings ซ้ำ
  await transactionPaymentService.processPayment('t_1', { method: 'promptpay', channel: 'mobile', amount: 100, gatewayCollected: true });
  assert.equal(saved.data?.totalPaid, 100);
  assert.equal(saved.selections.length, 1);
});

test('gate payment closes the transaction only when fully paid', async (t) => {
  const saved = mockOpenTransaction(t);
  const device = { deviceId: 'BG-1', deviceType: 'barrier_gate' };

  await transactionPaymentService.processPayment('t_1', { method: 'wallet', channel: 'gate', device, amount: 20 });
  assert.equal(saved.data?.status, 'partially_paid');
  assert.equal(saved.data?.exitAt, undefined);

  await transactionPaymentService.processPayment('t_1', { method: 'wallet', channel: 'gate', device });
  assert.equal(saved.data?.status, 'completed');
  assert.ok(saved.data?.exitAt);
  assert.ok((saved.data.exitAt as unknown) instanceof Date);
});

test('rejects a payment when nothing is left to pay instead of reporting not found', async (t) => {
  mockOpenTransaction(t, { totalPaid: 60 });

  await assert.rejects(transactionPaymentService.processPayment('t_1', { method: 'cash', channel: 'cashier' }), { statusCode: 400, code: 'NO_REMAINING_AMOUNT' });
});

test('rejects amount values that are not numbers', async (t) => {
  mockOpenTransaction(t);

  for (const amount of [true, [5], 'abc', 0]) {
    await assert.rejects(transactionPaymentService.processPayment('t_1', { method: 'cash', channel: 'cashier', amount }), { code: 'INVALID_AMOUNT' });
  }
});

test('falls back to the default exit window when expiryDuration is out of range', async (t) => {
  const saved = mockOpenTransaction(t);
  stub(t, transactionLookupService, {
    getTransactionContext: async () => ({
      pricingConfig: { pricingRules: [{ feeType: 'base_hour', vehicleType: 'car', hourStart: 1, hourEnd: 24, price: 30, status: 'active' }] },
      systemSettings: { receipt: { paymentBill: { expiryDuration: 1e12 } } },
    }),
  });

  await transactionPaymentService.processPayment('t_1', { method: 'cash', channel: 'cashier' });

  // ค่า default 30 นาที
  assert.equal(saved.data?.exitTimeLimit?.toISOString(), '2026-05-04T03:30:00.000Z');
});

test('stores the EDC reference on the payment', async (t) => {
  const saved = mockOpenTransaction(t);

  await transactionPaymentService.processPayment('t_1', { method: 'card', channel: 'cashier', processedBy: 'u_admin', reference: 'APPR-123456' });

  assert.equal(saved.data?.payments?.[0]?.reference, 'APPR-123456');
});

test('a payment sent again with the same reference returns the saved transaction without recording twice', async (t) => {
  const saved = mockOpenTransaction(t, { totalPaid: 60 });
  stub(t, transactionsRepository, {
    lockTransactionById: async () => ({ id: 't_1', plateNo: 'ABC1234', vehicleType: 'car', entryAt: new Date('2026-05-04T08:30:00+07:00'), totalPaid: 60, status: 'paid_waiting_exit', payments: [{ id: 'pay_1', method: 'card', paidAmount: 60, paidAt: '2026-05-04T03:00:00.000Z', reference: 'APPR-1' }] }),
  });

  const result = await transactionPaymentService.processPayment('t_1', { method: 'card', channel: 'kiosk', amount: 60, reference: 'APPR-1' });

  assert.equal(result?.duplicatePayment, true);
  assert.equal(saved.data, null);
});

test('rejects a reference that was already used on another transaction', async (t) => {
  const saved = mockOpenTransaction(t);
  stub(t, transactionsRepository, { findTransactionIdByPaymentReference: async () => 't_other' });

  // สลิปใบเดียวใช้ปล่อยรถได้คันเดียว
  await assert.rejects(
    transactionPaymentService.processPayment('t_1', { method: 'card', channel: 'kiosk', amount: 60, reference: 'APPR-1', terminalId: 'TID-1' }),
    { statusCode: 409, code: 'PAYMENT_REFERENCE_USED' },
  );
  assert.equal(saved.data, null);
});
