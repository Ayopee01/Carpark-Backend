// Import Library
import type { Prisma, Transaction } from '@prisma/client';
// Import Config
import { prisma } from '../db/prisma';
// Import Types
import type { DbClient } from '../types/shared/common.type';
import type { PaymentReferenceKey, PaymentRow, TransactionFilters } from '../types/shared/transaction.type';
// Import Utils
import { normalizePlateNo } from '../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config สถานะ transaction ที่จบแล้ว ไม่ต้องชำระเงินหรือเปิดไม้กั้นอีก
const TERMINAL_TRANSACTION_STATUSES: string[] = ['completed', 'cancelled'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือก prisma client ปกติ หรือ transaction client ที่ส่งเข้ามา
function client(connection?: DbClient): DbClient {
  return connection ?? prisma;
}

// Function เดาว่า keyword เป็นเลขทะเบียน (มีทั้งตัวอักษรและตัวเลข) เพื่อค้นหาแบบตัดช่องว่าง/ขีด
function isLikelyPlateKeyword(value: unknown): boolean {
  const normalized = normalizePlateNo(value);
  if (!normalized) return false;
  return /[\p{L}]/u.test(normalized) && /\d/.test(normalized);
}

// Function สร้าง Prisma where จาก filter ของรายการ transaction
function buildWhere({ keyword, plateNo, billNo, status, startDate, endDate }: TransactionFilters = {}): Prisma.TransactionWhereInput | undefined {
  const AND: Prisma.TransactionWhereInput[] = [];

  if (keyword) {
    if (isLikelyPlateKeyword(keyword)) {
      AND.push({ plateNo: { contains: normalizePlateNo(keyword) ?? '', mode: 'insensitive' } });
    } else {
      const contains = String(keyword);
      AND.push({
        OR: [
          { billNo: { contains, mode: 'insensitive' } },
          { plateNo: { contains, mode: 'insensitive' } },
          { serviceType: { contains, mode: 'insensitive' } },
        ],
      });
    }
  }

  if (plateNo) AND.push({ plateNo: { contains: String(plateNo).replace(/[\s-]/g, ''), mode: 'insensitive' } });
  if (billNo) AND.push({ billNo: { contains: String(billNo), mode: 'insensitive' } });
  if (Array.isArray(status) && status.length) {
    AND.push({ status: { in: status } });
  } else if (status) {
    AND.push({ status: String(status) });
  }

  if (startDate || endDate) {
    AND.push({
      entryAt: {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      },
    });
  }

  return AND.length ? { AND } : undefined;
}

// Function สร้าง where เฉพาะ transaction ที่ยังชำระเงินได้ เมื่อกำหนด payableOnly
function buildPayableFilter(payableOnly: boolean): Prisma.TransactionWhereInput {
  return payableOnly ? { status: { notIn: TERMINAL_TRANSACTION_STATUSES }, exitAt: null } : {};
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงรายการ transaction ตาม filter แบบแบ่งหน้า หรือทั้งหมดเมื่อ all เป็น true
async function listTransactionRows(filters: TransactionFilters = {}, { all = false, skip = 0, take = 10 }: { all?: boolean; skip?: number; take?: number } = {}, connection?: DbClient): Promise<{ rows: Transaction[]; count: number | null }> {
  const where = buildWhere(filters);
  if (all) {
    return { rows: await client(connection).transaction.findMany({ where, orderBy: { updatedAt: 'desc' } }), count: null };
  }

  const [rows, count] = await Promise.all([
    client(connection).transaction.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }),
    client(connection).transaction.count({ where }),
  ]);
  return { rows, count };
}

// Function ดึง transaction ทั้งหมดที่เข้าในช่วงวันที่
async function listTransactionRowsByEntryRange({ startDate, endDate }: Pick<TransactionFilters, 'startDate' | 'endDate'> = {}, connection?: DbClient): Promise<Transaction[]> {
  return client(connection).transaction.findMany({ where: buildWhere({ startDate, endDate }) });
}

// Function ดึง id และ payments ของ transaction ที่แก้ไขตั้งแต่เวลาที่กำหนด (payment ทุกรายการมี paidAt ไม่เกิน updatedAt)
async function listPaymentRowsUpdatedSince(since: Date | string, connection?: DbClient): Promise<PaymentRow[]> {
  return client(connection).transaction.findMany({
    where: { updatedAt: { gte: new Date(since) } },
    select: { id: true, plateNo: true, billNo: true, payments: true },
  });
}

// Function หา transaction ด้วย id
async function findTransactionById(id: string | null | undefined, connection?: DbClient): Promise<Transaction | null> {
  if (!id) return null;
  return client(connection).transaction.findUnique({ where: { id } });
}

// Function หา transaction ล่าสุดที่ทะเบียนตรงทั้งหมด
async function findLatestExactTransactionByPlateNo(plateNo: unknown, { payableOnly = false }: { payableOnly?: boolean } = {}, connection?: DbClient): Promise<Transaction | null> {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return null;

  return client(connection).transaction.findFirst({
    where: {
      plateNo: { equals: normalizedPlateNo, mode: 'insensitive' },
      ...buildPayableFilter(payableOnly),
    },
    orderBy: { entryAt: 'desc' },
  });
}

// Function หา transaction ล่าสุดของแต่ละทะเบียนที่มีคำค้น ใช้เป็นตัวเลือกเมื่อค้นหาเจอหลายคัน
async function listPlateCandidateRows(plateNo: unknown, { payableOnly = false, limit = 10 }: { payableOnly?: boolean; limit?: number } = {}, connection?: DbClient): Promise<Transaction[]> {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return [];

  const rows = await client(connection).transaction.findMany({
    where: {
      plateNo: { contains: normalizedPlateNo, mode: 'insensitive' },
      ...buildPayableFilter(payableOnly),
    },
    orderBy: { entryAt: 'desc' },
    take: Math.max(limit * 5, limit),
  });

  const byPlateNo = new Map<string, Transaction>();
  for (const row of rows) {
    const key = normalizePlateNo(row.plateNo)?.toLowerCase();
    if (key && !byPlateNo.has(key)) byPlateNo.set(key, row);
    if (byPlateNo.size >= limit) break;
  }

  return [...byPlateNo.values()];
}

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

// Function ล็อก transaction record ด้วย SELECT ... FOR UPDATE จนจบ database transaction แล้วคืน record ล่าสุด
async function lockTransactionById(id: string | null | undefined, connection?: DbClient): Promise<Transaction | null> {
  if (!id) return null;
  await client(connection).$queryRaw`SELECT id FROM transactions WHERE id = ${id} FOR UPDATE`;
  return findTransactionById(id, connection);
}

// Function ล็อกเลขอ้างอิงการชำระ (เช่นเลขอนุมัติ EDC ต่อเครื่อง) ด้วย advisory lock จนจบ database transaction
async function lockPaymentReference({ reference, terminalId = null }: PaymentReferenceKey, connection?: DbClient): Promise<void> {
  await client(connection).$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment_reference:${terminalId || ''}:${reference}`}))::text`;
}

// Function หา id ของ transaction อื่นที่มี payment ใช้เลขอ้างอิงนี้แล้ว (เทียบ reference + terminalId) คืน null ถ้าไม่มี
async function findTransactionIdByPaymentReference({ reference, terminalId = null }: PaymentReferenceKey, excludeId: string | null | undefined, connection?: DbClient): Promise<string | null> {
  // @> ใช้ GIN index คัดแถวก่อน แล้ว EXISTS เทียบ terminalId ให้ตรงทั้งกรณีที่ไม่มี terminalId
  const rows = await client(connection).$queryRaw<{ id: string }[]>`
    SELECT t.id FROM transactions t
    WHERE t.payments @> ${JSON.stringify([{ reference }])}::jsonb
      AND t.id <> ${excludeId || ''}
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(t.payments) p
        WHERE p->>'reference' = ${reference} AND COALESCE(p->>'terminalId', '') = ${terminalId || ''}
      )
    LIMIT 1`;
  return rows[0]?.id || null;
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

// Function แก้ไข transaction record ด้วย id
async function updateTransactionRecord(id: string, data: Prisma.TransactionUpdateInput, connection?: DbClient): Promise<Transaction> {
  return client(connection).transaction.update({ where: { id }, data });
}

// Function ลบ transaction record ด้วย id
async function deleteTransactionRecord(id: string, connection?: DbClient): Promise<Transaction> {
  return client(connection).transaction.delete({ where: { id } });
}

export { TERMINAL_TRANSACTION_STATUSES, createTransactionRecord, deleteTransactionRecord, findLatestExactTransactionByPlateNo, findOpenTransactionByPlateNo, findTransactionById, findTransactionIdByPaymentReference, listPaymentRowsUpdatedSince, listPlateCandidateRows, listRecentTransactionsByPlateNo, listTransactionRows, listTransactionRowsByEntryRange, lockPaymentReference, lockPlateNo, lockTransactionById, updateTransactionRecord };
