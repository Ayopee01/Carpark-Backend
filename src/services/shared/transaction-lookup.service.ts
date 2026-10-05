// Import Library
import type { Transaction } from '@prisma/client';
// Import Repositories
import * as configRepository from '../../repositories/config.repository';
import * as transactionsRepository from '../../repositories/transactions.repository';
// Import Mappers
import { toPlateCandidate, toTransactionApi } from '../../repositories/mappers/transaction.mapper';
// Import Types
import type { DbClient, Pagination, PaginationMeta } from '../../types/shared/common.type';
import type { PricingConfig, SystemSettings } from '../../types/shared/config.type';
import type { ListTransactionsInput, PaymentRow, PlateLookupResult, TransactionApi, TransactionFilters } from '../../types/shared/transaction.type';
// Import Utils
import { normalizePlateNo } from '../../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config จำนวนตัวอักษรขั้นต่ำของทะเบียนที่ใช้ค้นหาแบบบางส่วน
const MIN_PLATE_SEARCH_LENGTH = 4;

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจว่า transaction record ยังชำระเงินได้ (ยังไม่จบและรถยังไม่ออก)
function isPayableTransaction(row: Pick<Transaction, 'status' | 'exitAt'> | null): boolean {
  if (!row) return false;
  if (transactionsRepository.TERMINAL_TRANSACTION_STATUSES.includes(row.status)) return false;
  return !row.exitAt;
}

// Function คำนวณ pagination input ให้เป็นค่าที่ปลอดภัยสำหรับ query database
function normalizePagination(page: number | string = 1, perPage: number | string = 10): Pagination {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safePerPage = Math.min(Number(perPage) > 0 ? Number(perPage) : 10, 100);
  const from = (safePage - 1) * safePerPage;
  const to = from + safePerPage - 1;

  return { page: safePage, perPage: safePerPage, from, to };
}

// Function สร้าง meta response สำหรับ pagination
function buildMeta(page: number, perPage: number, total: number | null): PaginationMeta {
  const safeTotal = Number(total) >= 0 ? Number(total) : 0;
  return {
    page,
    perPage,
    total: safeTotal,
    totalPages: Math.ceil(safeTotal / perPage) || 1,
  };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง pricing config และ system settings ที่ใช้คำนวณ transaction response
async function getTransactionContext(): Promise<{ pricingConfig: PricingConfig; systemSettings: SystemSettings }> {
  const [pricingConfig, systemSettings] = await Promise.all([
    configRepository.getConfig('pricing_config'),
    configRepository.getConfig('system_settings'),
  ]);
  return { pricingConfig, systemSettings };
}

// Function ดึงรายการ transaction แบบแบ่งหน้าพร้อม meta หรือทั้งหมดเมื่อ all เป็น true
async function listTransactions({ all = false, page = 1, perPage = 10, ...filters }: ListTransactionsInput = {}): Promise<{ data: TransactionApi[]; meta: PaginationMeta | { all: true; total: number; totalFound: number } }> {
  const pagination = normalizePagination(page, perPage);
  const [{ rows, count }, context] = await Promise.all([
    transactionsRepository.listTransactionRows(filters, { all, skip: pagination.from, take: pagination.perPage }),
    getTransactionContext(),
  ]);
  const data = rows.map((row) => toTransactionApi(row, context));

  return {
    data,
    meta: all
      ? { all: true, total: data.length, totalFound: data.length }
      : buildMeta(pagination.page, pagination.perPage, count),
  };
}

// Function ดึง transaction ทั้งหมดที่เข้าในช่วงวันที่ในรูปแบบ API
async function listAllTransactions({ startDate, endDate }: Pick<TransactionFilters, 'startDate' | 'endDate'> = {}): Promise<TransactionApi[]> {
  const [rows, context] = await Promise.all([
    transactionsRepository.listTransactionRowsByEntryRange({ startDate, endDate }),
    getTransactionContext(),
  ]);
  return rows.map((row) => toTransactionApi(row, context));
}

// Function ดึง id และ payments ของ transaction ที่อาจมี payment จ่ายตั้งแต่เวลาที่กำหนด ใช้สรุปรายได้
async function listPaymentRowsSince(startDate: Date | string): Promise<PaymentRow[]> {
  return transactionsRepository.listPaymentRowsUpdatedSince(startDate);
}

// Function หา transaction record ด้วย id ก่อนแล้วค่อยหาจากทะเบียนแบบตรงทั้งหมด
async function findTransactionByIdOrPlateNo(value: string | null | undefined, options: { payableOnly?: boolean } = {}, connection?: DbClient): Promise<Transaction | null> {
  if (!value) return null;

  const byId = await transactionsRepository.findTransactionById(value, connection);
  if (byId) return options.payableOnly && !isPayableTransaction(byId) ? null : byId;

  return transactionsRepository.findLatestExactTransactionByPlateNo(value, options, connection);
}

// Function ดึง transaction ด้วย id ในรูปแบบ API
async function getTransactionApiById(id: string | null | undefined, connection?: DbClient): Promise<TransactionApi | null> {
  const [row, context] = await Promise.all([transactionsRepository.findTransactionById(id, connection), getTransactionContext()]);
  return toTransactionApi(row, context);
}

// Function ดึง transaction ล่าสุดของทะเบียนที่ตรงทุกตัวอักษรในรูปแบบ API (ไม่ค้นแบบบางส่วน)
async function getLatestExactTransactionApiByPlateNo(plateNo: unknown): Promise<TransactionApi | null> {
  const [row, context] = await Promise.all([transactionsRepository.findLatestExactTransactionByPlateNo(plateNo), getTransactionContext()]);
  return row ? toTransactionApi(row, context) : null;
}

// Function ค้นหา transaction จากทะเบียน คืน single, multiple (ให้ผู้ใช้เลือก), not_found หรือ invalid
async function lookupTransactionApiByPlateNo(plateNo: unknown, { payableOnly = false, maxCandidates = 10 }: { payableOnly?: boolean; maxCandidates?: number } = {}): Promise<PlateLookupResult> {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return { matchType: 'invalid', message: 'plateNo is required' };
  if (normalizedPlateNo.length < MIN_PLATE_SEARCH_LENGTH) {
    return { matchType: 'invalid', message: `plateNo must be at least ${MIN_PLATE_SEARCH_LENGTH} characters` };
  }

  const exact = await transactionsRepository.findLatestExactTransactionByPlateNo(normalizedPlateNo, { payableOnly });
  if (exact) return { matchType: 'single', transaction: toTransactionApi(exact, await getTransactionContext()) };

  const candidates = await transactionsRepository.listPlateCandidateRows(normalizedPlateNo, { payableOnly, limit: maxCandidates });
  if (!candidates.length) return { matchType: 'not_found' };
  if (candidates.length === 1) {
    return { matchType: 'single', transaction: toTransactionApi(candidates[0]!, await getTransactionContext()) };
  }

  return {
    matchType: 'multiple',
    requiresSelection: true,
    query: normalizedPlateNo,
    candidates: candidates.map((row) => toPlateCandidate(row)),
  };
}

export { findTransactionByIdOrPlateNo, getLatestExactTransactionApiByPlateNo, getTransactionApiById, getTransactionContext, isPayableTransaction, listAllTransactions, listPaymentRowsSince, listTransactions, lookupTransactionApiByPlateNo };
