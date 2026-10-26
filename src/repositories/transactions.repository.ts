// Import Library
import type { Prisma, Transaction } from '@prisma/client';
// Import Repositories
import { TERMINAL_TRANSACTION_STATUSES } from './shared/transaction.repository';
import { client } from './shared/repository-utils';
// Import Types
import type { DbClient } from '../types/shared/common.type';
// Import Utils
import { normalizePlateNo } from '../utils/vehicle';

/* -------------------------------------- Functions -------------------------------------- */

// Function หา transaction ล่าสุดที่ยังไม่จบของทะเบียนรถ
async function findOpenTransactionByPlateNo(plateNo: unknown, connection?: DbClient): Promise<Transaction | null> {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return null;

  return client(connection).transaction.findFirst({
    where: {
      plateNo: { equals: normalizedPlateNo, mode: 'insensitive' },
      status: { notIn: TERMINAL_TRANSACTION_STATUSES },
    },
    orderBy: { entryAt: 'desc' },
  });
}

// Function ล็อกตามทะเบียนด้วย advisory lock จนจบ database transaction (ใช้กับทะเบียนที่ยังไม่มี record)
async function lockPlateNo(plateNo: unknown, connection?: DbClient): Promise<void> {
  await client(connection).$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizePlateNo(plateNo) || ''}))::text`;
}

// Function ดึง transaction ล่าสุดของทะเบียนรถตามเวลาที่สร้าง ใช้ตรวจ event กล้องซ้ำ
async function listRecentTransactionsByPlateNo(plateNo: unknown, take = 20, connection?: DbClient): Promise<Transaction[]> {
  return client(connection).transaction.findMany({
    where: { plateNo: { equals: normalizePlateNo(plateNo) || '', mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

// Function สร้าง transaction record ใหม่
async function createTransactionRecord(data: Prisma.TransactionCreateInput, connection?: DbClient): Promise<Transaction> {
  return client(connection).transaction.create({ data });
}

// Function ลบ transaction record ด้วย id
async function deleteTransactionRecord(id: string, connection?: DbClient): Promise<Transaction> {
  return client(connection).transaction.delete({ where: { id } });
}

export { createTransactionRecord, deleteTransactionRecord, findOpenTransactionByPlateNo, listRecentTransactionsByPlateNo, lockPlateNo };
