// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '@prisma/client';
// Import Test Helpers
import { fixture } from '../support/mock';
// Import Mappers
import { toTransactionApi } from '../../src/repositories/mappers/transaction.mapper';
// Import Types
import type { TransactionApiContext } from '../../src/types/shared/transaction.type';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Config pricing และ system settings ที่ใช้คำนวณ transaction ใน test
const context: TransactionApiContext = {
  pricingConfig: { pricingRules: [{ id: 'pr_1', name: 'base_hour', feeType: 'base_hour', vehicleType: 'car', price: 20, status: 'active' }] },
  systemSettings: { general: { frontendUrl: '' } },
};

// Function สร้าง transaction record ที่จ่ายครบ 40 บาทตอน 10:00
function paidRecord(overrides: Partial<Record<keyof Transaction, unknown>>): Transaction {
  return fixture<Transaction>({
    id: 't_paid',
    billNo: 'PK202605010001',
    plateNo: 'ABC1234',
    vehicleType: 'car',
    serviceType: 'parking',
    entryAt: new Date('2026-05-01T08:00:00.000Z'),
    exitAt: null,
    amount: 40,
    totalPaid: 40,
    payments: [{ id: 'pay_1', paidAmount: 40, paidAt: '2026-05-01T10:00:00.000Z' }],
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
    ...overrides,
  });
}

/* -------------------------------------- Tests -------------------------------------- */

test('keeps a fully paid transaction waiting for exit until the exit window expires', () => {
  const transaction = toTransactionApi(paidRecord({ status: 'paid_waiting_exit', exitTimeLimit: new Date('2099-05-01T10:15:00.000Z') }), context);

  // ราคาหยุดคิดที่เวลาจ่ายเงินระหว่างที่ยังอยู่ในช่วงเวลาออก
  assert.equal(transaction.status, 'paid_waiting_exit');
  assert.equal(transaction.calculatedAt, '2026-05-01T10:00:00.000Z');
  assert.equal(transaction.remainingAmount, 0);
  assert.equal(transaction.isOverstay, false);
});

test('reports completed when a paid transaction already has exitAt', () => {
  const transaction = toTransactionApi(paidRecord({ status: 'partially_paid', exitAt: new Date('2026-05-01T10:00:00.000Z'), exitTimeLimit: new Date('2026-05-01T10:15:00.000Z') }), context);

  // exitAt แปลว่ารถออกแล้ว แม้ status ที่เก็บไว้ยังไม่อัปเดต
  assert.equal(transaction.status, 'completed');
  assert.equal(transaction.remainingAmount, 0);
});
