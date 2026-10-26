// Import Library
import type { Transaction } from '@prisma/client';
import { compareDesc } from 'date-fns';
// Import Repositories
import * as appConfigRepository from '../../repositories/shared/app-config.repository';
import * as transactionRepository from '../../repositories/shared/transaction.repository';
// Import Types
import type { DbClient, Pagination, PaginationMeta } from '../../types/shared/common.type';
import type { PricingConfig, SystemSettings } from '../../types/shared/config.type';
import type { ListTransactionsInput, PaymentRecord, PaymentRow, PlateCandidate, PlateCandidateRow, PlateLookupResult, TransactionApi, TransactionApiContext, TransactionFilters } from '../../types/shared/transaction.type';
// Import Utils
import { formatBangkok, toIsoOrNull } from '../../utils/date';
import { toJsonArray } from '../../utils/json';
import { subtractMoney } from '../../utils/money';
import { calculateFee } from '../../utils/parking-fee';
import { normalizePlateNo } from '../../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config จำนวนตัวอักษรขั้นต่ำของทะเบียนที่ใช้ค้นหาแบบบางส่วน
const MIN_PLATE_SEARCH_LENGTH = 4;

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจว่า transaction ยังชำระเงินได้ (ยังไม่จบและรถยังไม่ออก) ใช้ได้ทั้ง record และ TransactionApi
function isPayableTransaction(row: { status: string; exitAt: Date | string | null } | null | undefined): boolean {
  if (!row) return false;
  if (transactionRepository.TERMINAL_TRANSACTION_STATUSES.includes(row.status)) return false;
  return !row.exitAt;
}

// Function คำนวณ pagination input ให้เป็นค่าที่ปลอดภัยสำหรับ query database
function normalizePagination(page: number, perPage: number): Pagination {
  const from = (page - 1) * perPage;
  return { page, perPage, from, to: from + perPage - 1 };
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

// Function แปลงค่าเป็น number คืน null ถ้าแปลงไม่ได้
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง pricing config และ system settings ที่ใช้คำนวณ transaction response
async function getTransactionContext(): Promise<{ pricingConfig: PricingConfig; systemSettings: SystemSettings }> {
  const [pricingConfig, systemSettings] = await Promise.all([
    appConfigRepository.getConfig('pricing_config'),
    appConfigRepository.getConfig('system_settings'),
  ]);
  return { pricingConfig, systemSettings };
}

// Function ดึงรายการ transaction แบบแบ่งหน้าพร้อม meta หรือทั้งหมดเมื่อ all เป็น true
async function listTransactions({ all = false, page = 1, perPage = 10, ...filters }: ListTransactionsInput = {}): Promise<{ data: TransactionApi[]; meta: PaginationMeta | { all: true; total: number; totalFound: number } }> {
  const pagination = normalizePagination(page, perPage);
  const [{ rows, count }, context] = await Promise.all([
    transactionRepository.listTransactionRows(filters, { all, skip: pagination.from, take: pagination.perPage }),
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
    transactionRepository.listTransactionRowsByEntryRange({ startDate, endDate }),
    getTransactionContext(),
  ]);
  return rows.map((row) => toTransactionApi(row, context));
}

// Function ดึง id และ payments ของ transaction ที่อาจมี payment จ่ายตั้งแต่เวลาที่กำหนด ใช้สรุปรายได้
async function listPaymentRowsSince(startDate: Date | string): Promise<PaymentRow[]> {
  return transactionRepository.listPaymentRowsUpdatedSince(startDate);
}

// Function หา transaction record ด้วย id ก่อนแล้วค่อยหาจากทะเบียนแบบตรงทั้งหมด
async function findTransactionByIdOrPlateNo(value: string | null | undefined, options: { payableOnly?: boolean } = {}, connection?: DbClient): Promise<Transaction | null> {
  if (!value) return null;

  const byId = await transactionRepository.findTransactionById(value, connection);
  if (byId) return options.payableOnly && !isPayableTransaction(byId) ? null : byId;

  return transactionRepository.findLatestExactTransactionByPlateNo(value, options, connection);
}

// Function ดึง transaction ด้วย id ในรูปแบบ API
async function getTransactionApiById(id: string | null | undefined, connection?: DbClient): Promise<TransactionApi | null> {
  const [row, context] = await Promise.all([transactionRepository.findTransactionById(id, connection), getTransactionContext()]);
  return toTransactionApi(row, context);
}

// Function ดึง transaction ล่าสุดของทะเบียนที่ตรงทุกตัวอักษรในรูปแบบ API (ไม่ค้นแบบบางส่วน)
async function getLatestExactTransactionApiByPlateNo(plateNo: unknown): Promise<TransactionApi | null> {
  const [row, context] = await Promise.all([transactionRepository.findLatestExactTransactionByPlateNo(plateNo), getTransactionContext()]);
  return row ? toTransactionApi(row, context) : null;
}

// Function ค้นหา transaction จากทะเบียน คืน single, multiple (ให้ผู้ใช้เลือก), not_found หรือ invalid
async function lookupTransactionApiByPlateNo(plateNo: unknown, { payableOnly = false, maxCandidates = 10 }: { payableOnly?: boolean; maxCandidates?: number } = {}): Promise<PlateLookupResult> {
  const normalizedPlateNo = normalizePlateNo(plateNo);
  if (!normalizedPlateNo) return { matchType: 'invalid', message: 'plateNo is required' };
  if (normalizedPlateNo.length < MIN_PLATE_SEARCH_LENGTH) {
    return { matchType: 'invalid', message: `plateNo must be at least ${MIN_PLATE_SEARCH_LENGTH} characters` };
  }

  const exact = await transactionRepository.findLatestExactTransactionByPlateNo(normalizedPlateNo, { payableOnly });
  if (exact) return { matchType: 'single', transaction: toTransactionApi(exact, await getTransactionContext()) };

  const candidates = await transactionRepository.listPlateCandidateRows(normalizedPlateNo, { payableOnly, limit: maxCandidates });
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
      const latestPayment = [...payments].sort((a, b) => compareDesc(a.paidAt, b.paidAt))[0];
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
  const remainingAmount = Math.max(0, subtractMoney(netAmount, totalPaid));
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
  const dateFormatted = formatBangkok(entryAt, 'dd-MM-yyyy');

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

export { findTransactionByIdOrPlateNo, getLatestExactTransactionApiByPlateNo, getTransactionApiById, getTransactionContext, isPayableTransaction, listAllTransactions, listPaymentRowsSince, listTransactions, lookupTransactionApiByPlateNo, toTransactionApi };
