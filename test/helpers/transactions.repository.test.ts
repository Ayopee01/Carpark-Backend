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

/* -------------------------------------- Types -------------------------------------- */

// Type query ของ findMany ที่ test ตรวจ
interface CapturedQuery {
  where?: { plateNo?: { contains?: string }; status?: { notIn?: string[] }; exitAt?: null };
  take?: number;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function แทน prisma.transaction.findMany ชั่วคราว คืน query ที่ถูกเรียกล่าสุด
function mockFindMany(t: TestContext, rows: object[]): { query: CapturedQuery } {
  const captured: { query: CapturedQuery } = { query: {} };
  stub(t, prisma.transaction, {
    findMany: (args) => {
      captured.query = (args ?? {}) as CapturedQuery;
      return rows;
    },
  });
  return captured;
}

/* -------------------------------------- Tests -------------------------------------- */

test('groups plate candidates by full plate using the latest transaction', async (t) => {
  const captured = mockFindMany(t, [
    { id: 't_latest_1', plateNo: 'ABC1234', entryAt: new Date('2026-05-01T12:00:00.000Z'), status: 'pending' },
    { id: 't_latest_2', plateNo: 'XYZ1234', entryAt: new Date('2026-05-01T11:00:00.000Z'), status: 'pending' },
    { id: 't_old_1', plateNo: 'ABC1234', entryAt: new Date('2026-05-01T10:00:00.000Z'), status: 'completed' },
  ]);

  const candidates = await transactionsRepository.listPlateCandidateRows('1234');

  assert.equal(captured.query.where?.plateNo?.contains, '1234');
  assert.deepEqual(candidates.map((item) => item.id), ['t_latest_1', 't_latest_2']);
});

test('payable plate candidates exclude terminal and exited transactions', async (t) => {
  const captured = mockFindMany(t, []);

  await transactionsRepository.listPlateCandidateRows('1234', { payableOnly: true });

  assert.deepEqual(captured.query.where?.status?.notIn, ['completed', 'cancelled']);
  assert.equal(captured.query.where?.exitAt, null);
});
