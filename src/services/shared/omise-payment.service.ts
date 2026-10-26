// Import Library
import { addHours, addMinutes, isAfter } from 'date-fns';
// Import Config
import { withTransaction } from '../../db/prisma';
// Import Repositories
import * as chargeRepository from '../../repositories/shared/charge.repository';
import * as transactionRepository from '../../repositories/shared/transaction.repository';
// Import Services
import * as omiseApiService from './omise-api.service';
import * as paymentSelectionService from './payment-selection.service';
import * as transactionLookupService from './transaction-lookup.service';
import * as transactionPaymentService from './transaction-payment.service';
// Import Types
import type { ActiveGatewayCharge, AdminChargeInput, ClientChargeInput, GatewayChargeApi, GatewayChargeEvent, GatewayProcessResult, OmiseChargeData, OmiseChargeResponse, OmiseDocumentFile, OmiseSourceInput, OmiseWebhookEvent, RefundActionInput, RefundItem, RefundReason } from '../../types/shared/payment.type';
import type { PlateCandidate, ProcessPaymentResult, TransactionApi } from '../../types/shared/transaction.type';
// Import Validation
import { adminOmiseChargeInputSchema, adminQrImageInputSchema, chargeIdInputSchema, clientOmiseChargeInputSchema } from '../../validation/schemas';
import { parseWithSchema } from '../../validation/parser';
// Import Utils
import { ApiError } from '../../utils/api-error';
import { appEvents, emitDashboardUpdated } from '../../utils/events';
import { logger } from '../../utils/logger';
import { fromSatang, subtractMoney } from '../../utils/money';
import { normalizePlateNo } from '../../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config เวลาขั้นต่ำ (นาที) ที่ QR เดิมต้องเหลือก่อนหมดอายุจึงจะใช้ซ้ำได้
const REUSE_MIN_REMAINING_MINUTES = 2;

// Config อายุ charge ของ Omise เมื่อไม่มี expires_at (ค่า default ของ Omise 24 ชม.)
const DEFAULT_CHARGE_TTL_HOURS = 24;

// Config ยอดขั้นต่ำ (บาท) ที่ Omise รับต่อ charge แยกตาม method (PromptPay ฿20.00 ตามเอกสาร https://docs.omise.co/promptpay)
const GATEWAY_MINIMUM_AMOUNTS: Record<string, number> = { promptpay: 20 };

/* -------------------------------------- Helpers -------------------------------------- */

// Function หา method ของ gateway payment จาก method หรือ sourceType (schema ของ charge บังคับให้มีอย่างใดอย่างหนึ่งแล้ว)
function normalizeGatewayMethod(method: string | null | undefined, sourceType: string | null | undefined): string {
  return String(method || '').trim().toLowerCase() || String(sourceType || '').trim().toLowerCase();
}

// Function สร้าง response ของ charge (reused = ใช้ QR เดิมที่ยังรอจ่ายอยู่)
function toChargeResponse({ charge, gatewayCharge, transaction, reused = false }: { charge: OmiseChargeData; gatewayCharge: GatewayChargeApi; transaction: TransactionApi; reused?: boolean }): OmiseChargeResponse {
  return {
    provider: 'omise',
    reused,
    chargeId: charge.id,
    status: omiseApiService.normalizeChargeStatus(charge),
    amount: gatewayCharge.amount,
    currency: gatewayCharge.currency,
    plateNo: gatewayCharge.plateNo,
    method: gatewayCharge.method,
    channel: gatewayCharge.channel,
    authorizeUri: charge.authorize_uri || null,
    expiresAt: charge.expires_at || null,
    transaction: {
      plateNo: transaction.plateNo,
      status: transaction.status,
      remainingAmount: transaction.remainingAmount,
      exitTimeLimit: transaction.exitTimeLimit,
    },
    qr: charge.source?.scannable_code || null,
  };
}

// Function เติม /download ท้าย document path ของ Omise
function withDownloadPath(documentPath: string | null | undefined): string {
  const value = String(documentPath || '').trim();
  if (!value || /\/download(\?.*)?$/.test(value)) return value;

  const queryIndex = value.indexOf('?');
  if (queryIndex === -1) return `${value}/download`;
  return `${value.slice(0, queryIndex)}/download${value.slice(queryIndex)}`;
}

// Function รวม path รูป QR ที่เป็นไปได้จาก Omise charge
function getChargeQrDocumentPaths(charge: OmiseChargeData | null | undefined): string[] {
  const image = charge?.source?.scannable_code?.image;
  const paths = [image?.download_uri, withDownloadPath(image?.location), image?.location, image?.uri].filter((path): path is string => Boolean(path));
  return [...new Set(paths)];
}

// Function ดาวน์โหลดรูป QR จาก path แรกที่ใช้ได้
async function downloadFirstQrDocument(paths: string[]): Promise<OmiseDocumentFile> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await omiseApiService.downloadDocument(path);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  throw new ApiError(502, 'OMISE_QR_DOCUMENT_NOT_FOUND', 'Omise QR document not found');
}

// Function เลือก source ของ charge: ใช้ source จาก Omise.js ถ้าส่งมา ไม่งั้นให้ backend สร้าง source PromptPay เอง (secret key) schema ของ charge ตรวจแล้วว่าไม่มี source ต้องเป็น promptpay
function resolveChargeSource({ source }: Pick<ClientChargeInput, 'source'>): string | OmiseSourceInput {
  return source || { type: 'promptpay' };
}

// Function หา transaction ที่จ่ายได้จากทะเบียน ถ้าเจอหลายคันให้ผู้ใช้เลือกก่อน
async function requirePayableTransactionByPlateNo(plateNo: string): Promise<TransactionApi> {
  const lookup = await transactionLookupService.lookupTransactionApiByPlateNo(plateNo, { payableOnly: true });
  if (lookup.matchType === 'invalid') throw new ApiError(400, 'INVALID_PLATE_NO', lookup.message);
  if (lookup.matchType === 'not_found' || (lookup.matchType === 'single' && !lookup.transaction)) {
    throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
  }
  if (lookup.matchType === 'multiple') {
    throw new ApiError(409, 'MULTIPLE_PLATE_MATCHES', 'Multiple plate matches require user selection', {
      matchType: 'multiple',
      requiresSelection: true,
      candidates: lookup.candidates satisfies PlateCandidate[],
    });
  }
  return lookup.transaction!;
}

// Function หา transaction ที่ client จ่ายได้จาก transactionId (ค่าจาก QR บนตั๋ว) และ plateNo ต้องเป็นของรายการนั้น
// รายการที่ปิดแล้วตอบ TRANSACTION_ALREADY_PROCESSED ก่อนเทียบทะเบียน จึงไม่บอกอะไรเกี่ยวกับรายการนั้นเพิ่ม
async function requireClientTransactionById(transactionId: string, plateNo: string): Promise<TransactionApi> {
  const transaction = await transactionLookupService.getTransactionApiById(transactionId);
  if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
  if (!transactionLookupService.isPayableTransaction(transaction)) {
    throw new ApiError(403, 'TRANSACTION_ALREADY_PROCESSED', 'This transaction is already processed');
  }
  if (normalizePlateNo(transaction.plateNo) !== normalizePlateNo(plateNo)) {
    throw new ApiError(400, 'TRANSACTION_PLATE_MISMATCH', 'plateNo does not match the transaction');
  }
  return transaction;
}

// Function หา transaction ที่จ่ายได้จาก transactionId หรือทะเบียน (adminOmiseChargeInputSchema บังคับให้มีอย่างใดอย่างหนึ่งแล้ว)
async function requirePayableTransaction({ transactionId, plateNo }: { transactionId?: string | null; plateNo?: string | null }): Promise<TransactionApi> {
  if (transactionId) {
    const transaction = await transactionLookupService.getTransactionApiById(transactionId);
    if (!transaction) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    if (!transactionLookupService.isPayableTransaction(transaction)) {
      throw new ApiError(400, 'TRANSACTION_NOT_PAYABLE', 'Transaction is not payable');
    }
    return transaction;
  }

  return requirePayableTransactionByPlateNo(plateNo as string);
}

// Function ดึงยอดค้างชำระที่ต้องมากกว่า 0
function requireRemainingAmount(transaction: TransactionApi): number {
  const remainingAmount = Number(transaction.remainingAmount);
  if (!Number.isFinite(remainingAmount) || remainingAmount <= 0) {
    throw new ApiError(400, 'NO_REMAINING_AMOUNT', 'No payable amount remaining');
  }
  return remainingAmount;
}

// Function ตรวจยอดค้างไม่ต่ำกว่าขั้นต่ำของ Omise ก่อนสร้าง charge (ให้ผู้ใช้เห็นข้อความที่ชัดแทน error ของ Omise)
function assertGatewayMinimumAmount(method: string, remainingAmount: number): void {
  const minimumAmount = GATEWAY_MINIMUM_AMOUNTS[method];
  if (minimumAmount === undefined || remainingAmount >= minimumAmount) return;
  throw new ApiError(400, 'AMOUNT_BELOW_GATEWAY_MINIMUM', `${method} requires at least ${minimumAmount} THB per payment`, { minimumAmount, remainingAmount });
}

// Function ตรวจยอด (สตางค์) ที่ frontend ส่งมาต้องตรงกับยอดค้างชำระปัจจุบัน
function assertRequestedMinorAmount(amount: unknown, remainingAmount: number): void {
  if (amount === undefined || amount === null || amount === '') return;

  // รูปแบบ amount ตรวจแล้วใน adminOmiseChargeInputSchema
  if (Number(amount) !== omiseApiService.toMinorAmount(remainingAmount)) {
    throw new ApiError(400, 'AMOUNT_MISMATCH', 'amount does not match current remaining amount');
  }
}

// Function หาเหตุผลที่ลงเงินใน transaction ไม่ได้ (null คือยังรับเงินได้)
function getUnpayableReason(transaction: TransactionApi | null): RefundReason | null {
  if (!transaction) return 'transaction_not_found';
  if (!transactionLookupService.isPayableTransaction(transaction)) return 'transaction_not_payable';
  if (!(Number(transaction.remainingAmount) > 0)) return 'already_paid';
  return null;
}

// Function คำนวณยอดที่ต้องคืน (สตางค์) เมื่อเงินจาก gateway เกินยอดค่าจอดหลังลงเงินแล้ว
function getOverpaidRefundAmount(chargeAmount: number, transaction: TransactionApi): number {
  const overpaid = subtractMoney(transaction.totalPaid ?? 0, transaction.netAmount ?? 0);
  return overpaid > 0 ? Math.min(chargeAmount, omiseApiService.toMinorAmount(overpaid)) : 0;
}

// Function แปลง gateway charge เป็นรายการรอคืนเงินที่ส่งให้ Admin (เงินเป็นสตางค์ ไม่มี raw ของ Omise)
function toRefundItem(charge: GatewayChargeApi): RefundItem {
  return {
    chargeId: charge.chargeId,
    transactionId: charge.transactionId,
    plateNo: charge.plateNo,
    method: charge.method,
    channel: charge.channel,
    amount: charge.amount,
    refundAmount: charge.refundAmount,
    refundReason: charge.refundReason,
    paidAt: charge.paidAt,
    refundMethod: charge.refundMethod ?? null,
  };
}

// Function ส่ง refund_resolved หลังบันทึกว่าคืนเงินแล้ว (refundMethod manual = พนักงานคืนเอง)
async function emitRefundResolved(charge: GatewayChargeApi): Promise<void> {
  emitDashboardUpdated('gateway_refund_resolved', { id: charge.transactionId, plateNo: charge.plateNo });
  await emitRefundEvent('refund_resolved', {
    chargeId: charge.chargeId,
    transactionId: charge.transactionId,
    plateNo: charge.plateNo,
    resolvedBy: charge.refundResolvedBy,
    refundNote: charge.refundNote,
    refundResolvedAt: charge.refundResolvedAt,
    refundMethod: charge.refundMethod,
    refundId: charge.refundId,
  });
}

// Function ส่ง refund event ให้ Admin พร้อมยอดรอคืนล่าสุดหลังเหตุการณ์นี้ (error แค่ log เพราะบันทึก database สำเร็จแล้ว)
async function emitRefundEvent(type: 'refund_required' | 'refund_resolved', payload: Record<string, unknown>): Promise<void> {
  try {
    const pending = await chargeRepository.summarizePendingRefunds();
    appEvents.emit('refund_event', { type, ...payload, pendingCount: pending.count, pendingAmount: pending.amount, at: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, `Unable to emit ${type}`);
  }
}

// Function ส่ง payment_updated หลังบันทึก gateway charge (ไม่ส่ง raw ของ Omise ออกไป)
function emitGatewayPaymentUpdated(
  existing: GatewayChargeApi,
  { latest, transaction, refundAmount, refundReason, updated }: { latest: TransactionApi | null; transaction: ProcessPaymentResult | null; refundAmount: number; refundReason: RefundReason; updated: GatewayChargeApi | null }
): void {
  appEvents.emit('payment_updated', {
    type: 'payment_updated',
    provider: 'omise',
    chargeId: existing.chargeId,
    plateNo: latest?.plateNo || existing.plateNo,
    transactionId: latest?.id || existing.transactionId,
    paymentStatus: 'successful',
    transactionStatus: latest?.status || null,
    remainingAmount: latest?.remainingAmount ?? null,
    exitTimeLimit: latest?.exitTimeLimit || null,
    applied: Boolean(transaction),
    refundRequired: refundAmount > 0,
    refundAmount: refundAmount > 0 ? refundAmount : null,
    refundReason: refundAmount > 0 ? refundReason : null,
    gatewayCharge: toGatewayChargeEvent(updated),
    emittedAt: new Date().toISOString(),
  });
}

// Function ปิด gateway charge ที่จ่ายสำเร็จ บันทึก payment ครั้งเดียว ถ้ารายการปิด/จ่ายครบแล้วบันทึกเป็นยอดรอคืนและตอบสำเร็จเพื่อหยุด Omise retry
async function completeSuccessfulGatewayCharge(existing: GatewayChargeApi, charge: OmiseChargeData, { processedByPrefix = 'omise' }: { processedByPrefix?: string } = {}): Promise<GatewayProcessResult> {
  const metadata: Record<string, unknown> = { ...(existing.raw?.metadata || {}), ...(charge?.metadata || {}) };

  // claim charge, ล็อก transaction และลงเงินใน database transaction เดียว webhook ที่ซ้ำหรือยิงพร้อมกันจึงลงเงินได้ครั้งเดียว
  const result = await withTransaction(async (connection) => {
    if (!(await chargeRepository.claimGatewayCharge(existing.chargeId, connection))) return null;
    await transactionRepository.lockTransactionById(existing.transactionId, connection);

    const current = await transactionLookupService.getTransactionApiById(existing.transactionId, connection);
    const unpayableReason = getUnpayableReason(current);
    const transaction = unpayableReason ? null : await transactionPaymentService.processPayment(existing.transactionId, {
      method: existing.method,
      channel: existing.channel,
      amount: fromSatang(existing.amount),
      gatewayCollected: true,
      processedBy: (metadata.processedBy as string | undefined) || `${processedByPrefix}_${existing.chargeId}`,
    }, connection);

    // ลงเงินไม่ได้ (เช่นรายการถูกปิดระหว่างจ่าย) ต้องคืนทั้งก้อน, ลงได้แต่เกินยอดต้องคืนส่วนเกิน
    const refundReason: RefundReason = transaction ? 'overpaid' : unpayableReason || 'transaction_not_payable';
    const refundAmount = transaction ? getOverpaidRefundAmount(existing.amount, transaction) : existing.amount;
    const updated = await chargeRepository.updateGatewayCharge(existing.chargeId, {
      status: 'successful',
      raw: charge,
      paidAt: omiseApiService.getChargePaidAt(charge) || new Date().toISOString(),
      processedAt: new Date().toISOString(),
      ...(refundAmount > 0 ? { refundAmount, refundReason } : {}),
    }, connection);
    return { current, transaction, refundAmount, refundReason, updated };
  });

  if (!result) {
    await chargeRepository.updateGatewayCharge(existing.chargeId, { status: 'successful', raw: charge });
    return { action: 'already_processed', chargeId: existing.chargeId, status: 'successful' };
  }

  const { current, transaction, refundAmount, refundReason, updated } = result;
  const latest = transaction || current;
  emitGatewayPaymentUpdated(existing, { latest, transaction, refundAmount, refundReason, updated });
  if (transaction) emitDashboardUpdated('payment_processed', transaction);
  if (refundAmount > 0) {
    emitDashboardUpdated('gateway_refund_required', latest || { id: existing.transactionId, plateNo: existing.plateNo });
    if (updated) await emitRefundEvent('refund_required', { ...toRefundItem(updated), applied: Boolean(transaction) });
  }

  return {
    action: transaction ? 'processed' : 'refund_required',
    chargeId: existing.chargeId,
    status: 'successful',
    ...(refundAmount > 0 ? { refundAmount, refundReason } : {}),
    ...(transaction ? { transaction } : {}),
  };
}

// Function สร้าง gateway charge จาก metadata ของ Omise charge เมื่อ record หาย (สร้าง charge สำเร็จแต่บันทึก database ไม่ทัน)
async function reconcileGatewayChargeFromOmise(charge: OmiseChargeData): Promise<GatewayChargeApi | null> {
  const metadata = (charge?.metadata || {}) as Record<string, string | undefined>;
  if (!metadata.transactionId || !metadata.channel || !metadata.method) return null;

  return chargeRepository.createGatewayChargeIfMissing({
    chargeId: charge.id,
    transactionId: metadata.transactionId,
    plateNo: metadata.plateNo || '',
    amount: charge.amount ?? 0,
    currency: charge.currency ?? '',
    method: metadata.method,
    channel: metadata.channel,
    status: omiseApiService.normalizeChargeStatus(charge),
    raw: charge,
  });
}

// Function อ่านเวลาหมดอายุของ charge (ไม่มี expires_at ใช้ค่า default ของ Omise นับจากเวลาสร้าง)
function getChargeExpiresAt(gatewayCharge: GatewayChargeApi): Date {
  if (gatewayCharge.raw?.expires_at) return new Date(gatewayCharge.raw.expires_at);
  return addHours(gatewayCharge.createdAt || new Date(), DEFAULT_CHARGE_TTL_HOURS);
}

// Function ตรวจว่า QR ของ charge ยังเหลือเวลาพอให้ใช้ซ้ำ
function hasReusableExpiry(raw: OmiseChargeData | null): boolean {
  if (!raw?.expires_at) return true;
  return isAfter(raw.expires_at, addMinutes(new Date(), REUSE_MIN_REMAINING_MINUTES));
}

// Function หา charge (source เช่น PromptPay) เดิมที่ยังรอจ่ายและยอดตรงกับยอดค้าง เพื่อคืน QR เดิมแทนการสร้างใหม่ (กันจ่ายซ้ำ)
async function findReusableGatewayCharge({ transaction, remainingAmount, method, channel }: { transaction: TransactionApi; remainingAmount: number; method: string; channel: string }): Promise<{ charge: OmiseChargeData; gatewayCharge: GatewayChargeApi } | null> {
  const amount = omiseApiService.toMinorAmount(remainingAmount);
  const candidates = (await chargeRepository.listPendingGatewayChargesByTransactionId(transaction.id))
    .filter((item) => item.method === method && item.channel === channel && item.amount === amount && hasReusableExpiry(item.raw));

  for (const candidate of candidates) {
    try {
      const live = await omiseApiService.retrieveCharge(candidate.chargeId);
      const status = omiseApiService.normalizeChargeStatus(live);
      if (status === 'pending') {
        const raw: OmiseChargeData = { ...live, metadata: { ...(candidate.raw?.metadata || {}), ...(live.metadata || {}) } };
        const gatewayCharge = await chargeRepository.updateGatewayCharge(candidate.chargeId, { raw });
        if (gatewayCharge) return { charge: raw, gatewayCharge };
      }
      // จ่ายสำเร็จแล้วปล่อยให้ webhook ปิดรายการ ส่วนสถานะอื่นอัปเดตไว้ไม่ให้ถูกเลือกซ้ำ
      if (status !== 'successful') await chargeRepository.updateGatewayCharge(candidate.chargeId, { status, raw: live });
    } catch (err) {
      logger.warn({ err, chargeId: candidate.chargeId }, 'Unable to reuse Omise charge');
    }
  }

  return null;
}

// Function หา gateway charge ของ Omise ที่ต้องมีอยู่
async function requireOmiseGatewayCharge(chargeId: string): Promise<GatewayChargeApi> {
  const gatewayCharge = await chargeRepository.getGatewayChargeByChargeId(chargeId);
  if (!gatewayCharge) throw new ApiError(404, 'GATEWAY_CHARGE_NOT_FOUND', 'Gateway charge not found');
  if (gatewayCharge.provider !== 'omise') throw new ApiError(400, 'NOT_OMISE_CHARGE', 'Gateway charge is not an Omise charge');
  return gatewayCharge;
}

// Function สร้าง Omise charge แบบ source ของรายการที่ตรวจสิทธิ์และหาไว้แล้ว ใช้ร่วมกันทั้ง client และ Admin
// ตรวจ method, ยอดขั้นต่ำของ Omise และ payment settings ก่อน ถ้ามี QR เดิมที่ยังรอจ่ายยอดเดียวกันคืนอันเดิม (reused) ไม่สร้างใหม่
async function createSourceCharge({ transaction, remainingAmount, chargeSource, sourceType, method, channel, returnUri, description, metadata }: {
  transaction: TransactionApi;
  remainingAmount: number;
  chargeSource: string | OmiseSourceInput;
  sourceType?: string | null;
  method?: string | null;
  channel: string;
  returnUri?: string | null;
  description: string;
  metadata: Record<string, string>;
}): Promise<OmiseChargeResponse> {
  const paymentMethod = normalizeGatewayMethod(method, sourceType);
  assertGatewayMinimumAmount(paymentMethod, remainingAmount);
  // ตรวจ payment settings ก่อนเก็บเงิน เพื่อไม่ให้สร้าง QR ด้วย method ที่ปิดอยู่
  await paymentSelectionService.assertPaymentSelection(channel, paymentMethod);
  const reusable = await findReusableGatewayCharge({ transaction, remainingAmount, method: paymentMethod, channel });
  if (reusable) return toChargeResponse({ ...reusable, transaction, reused: true });

  const chargeMetadata = { transactionId: transaction.id, plateNo: transaction.plateNo, channel, method: paymentMethod, ...metadata };
  const charge = await omiseApiService.createCharge({
    amount: remainingAmount,
    source: chargeSource,
    returnUri,
    description: `${description} ${transaction.plateNo}`,
    expiresAt: paymentMethod === 'promptpay' ? omiseApiService.getQrExpiresAt() : undefined,
    metadata: chargeMetadata,
  });
  // เก็บ metadata ที่ส่งไปไว้ใน raw ด้วย ใช้กู้ gateway charge จาก Omise ได้แม้ Omise ไม่ได้คืน metadata ครบ
  const raw: OmiseChargeData = { ...charge, metadata: { ...(charge.metadata || {}), ...chargeMetadata } };

  const gatewayCharge = await chargeRepository.createGatewayCharge({
    chargeId: charge.id,
    transactionId: transaction.id,
    plateNo: transaction.plateNo,
    amount: charge.amount ?? omiseApiService.toMinorAmount(remainingAmount),
    currency: charge.currency ?? 'thb',
    method: paymentMethod,
    channel,
    status: omiseApiService.normalizeChargeStatus(charge),
    raw,
  });

  return toChargeResponse({ charge: raw, gatewayCharge, transaction });
}

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง Omise charge แบบ source (เช่น PromptPay) สำหรับ mobile/kiosk/barrier gate (channel มาจาก client source)
// มี transactionId หารายการด้วย id (mobile ต้องส่งเสมอ) ไม่มีหาจากทะเบียน (kiosk/barrier gate)
async function createOmiseChargeForClient(input: ClientChargeInput = {}): Promise<OmiseChargeResponse> {
  const { plateNo } = parseWithSchema(clientOmiseChargeInputSchema, input);
  const { transactionId, source, sourceType, method, channel, processedBy, returnUri } = input;
  const chargeSource = resolveChargeSource({ source });
  // channel มาจาก client source ฝั่ง server ไม่ใช่ input ของผู้ใช้
  if (!channel) throw new ApiError(400, 'PAYMENT_CHANNEL_REQUIRED', 'payment channel is required');

  const transaction = transactionId ? await requireClientTransactionById(transactionId, plateNo) : await requirePayableTransactionByPlateNo(plateNo);
  return createSourceCharge({
    transaction,
    remainingAmount: requireRemainingAmount(transaction),
    chargeSource,
    sourceType,
    method,
    channel,
    returnUri,
    description: 'Parking payment',
    metadata: { processedBy: processedBy || 'omise' },
  });
}

// Function สร้าง Omise charge แบบ source (เช่น PromptPay) สำหรับ Admin (channel cashier และเก็บ sourceContext admin ใน metadata)
async function createOmiseChargeForAdmin(input: AdminChargeInput = {}): Promise<OmiseChargeResponse> {
  parseWithSchema(adminOmiseChargeInputSchema, input);
  const { transactionId, plateNo, source, sourceType, method, amount, processedBy, returnUri } = input;
  const chargeSource = resolveChargeSource({ source });

  const transaction = await requirePayableTransaction({ transactionId, plateNo });
  const remainingAmount = requireRemainingAmount(transaction);
  assertRequestedMinorAmount(amount, remainingAmount);
  return createSourceCharge({
    transaction,
    remainingAmount,
    chargeSource,
    sourceType,
    method,
    channel: 'cashier',
    returnUri,
    description: 'Admin parking payment',
    metadata: { sourceContext: 'admin', processedBy: processedBy || 'admin' },
  });
}

// Function ดึงรูป QR PromptPay จาก gateway charge ที่บันทึกไว้ หรือจาก document path ของ Omise
async function getOmiseQrImage(input: { chargeId?: unknown; documentPath?: unknown } = {}): Promise<OmiseDocumentFile> {
  const parsed = parseWithSchema(adminQrImageInputSchema, input);
  if (parsed.documentPath) return omiseApiService.downloadDocument(parsed.documentPath);

  // schema บังคับแล้วว่าไม่มี documentPath ต้องมี chargeId
  const chargeId = parsed.chargeId as string;
  const gatewayCharge = await requireOmiseGatewayCharge(chargeId);
  if (gatewayCharge.method !== 'promptpay') {
    throw new ApiError(400, 'QR_ONLY_FOR_PROMPTPAY', 'QR image is only available for PromptPay charges');
  }

  let qrDocumentPaths = getChargeQrDocumentPaths(gatewayCharge.raw);
  if (qrDocumentPaths.length === 0) {
    const charge = await omiseApiService.retrieveCharge(chargeId);
    qrDocumentPaths = getChargeQrDocumentPaths(charge);
    await chargeRepository.updateGatewayCharge(chargeId, { raw: charge });
  }
  if (qrDocumentPaths.length === 0) throw new ApiError(502, 'OMISE_QR_DOCUMENT_NOT_FOUND', 'Omise QR document not found');

  return downloadFirstQrDocument(qrDocumentPaths);
}

// Function ดึงรูป QR PromptPay ให้ client จาก chargeId เท่านั้น และเฉพาะ charge ที่ยังรอจ่าย (ไม่รับ documentPath)
async function getClientOmiseQrImage(input: { chargeId?: string | null } = {}): Promise<OmiseDocumentFile> {
  const { chargeId } = parseWithSchema(chargeIdInputSchema, input);

  const gatewayCharge = await requireOmiseGatewayCharge(chargeId);
  if (gatewayCharge.status !== 'pending' || gatewayCharge.processedAt) {
    throw new ApiError(400, 'QR_NOT_PAYABLE', 'QR image is only available while the charge is pending');
  }
  return getOmiseQrImage({ chargeId });
}

// Function ประมวลผล webhook จาก Omise โดยดึงสถานะจริงจาก Omise และบันทึก payment ครั้งเดียว (รองรับการส่งซ้ำ)
async function processOmiseWebhookEvent(event: OmiseWebhookEvent | null | undefined): Promise<GatewayProcessResult> {
  // event ของ object อื่น (เช่น refund, transfer) ตอบสำเร็จเพื่อไม่ให้ Omise retry
  if (omiseApiService.isNonChargeEvent(event)) return { action: 'ignored', reason: 'not a charge event', object: event?.data?.object };

  const chargeId = omiseApiService.extractChargeIdFromEvent(event);
  if (!chargeId) throw new ApiError(400, 'CHARGE_ID_NOT_FOUND', 'Omise charge id not found in webhook event');

  const charge = await omiseApiService.retrieveCharge(chargeId);
  const status = omiseApiService.normalizeChargeStatus(charge);
  const existing = await chargeRepository.getGatewayChargeByChargeId(chargeId) || await reconcileGatewayChargeFromOmise(charge);
  if (!existing) return { action: 'ignored', reason: 'gateway charge not found', chargeId, status };

  if (existing.processedAt) {
    await chargeRepository.updateGatewayCharge(chargeId, { status, raw: charge });
    return { action: 'already_processed', chargeId, status };
  }

  if (status !== 'successful') {
    const updated = await chargeRepository.updateGatewayCharge(chargeId, { status, raw: charge });
    appEvents.emit('payment_updated', {
      type: 'payment_updated',
      provider: 'omise',
      chargeId,
      plateNo: existing.plateNo,
      paymentStatus: status,
      gatewayCharge: toGatewayChargeEvent(updated),
      emittedAt: new Date().toISOString(),
    });
    return { action: 'updated', chargeId, status };
  }

  return completeSuccessfulGatewayCharge(existing, charge);
}

// Function ตรวจสถานะ charge กับ Omise ตามที่พนักงานกด (สำรองเมื่อ webhook ไม่มา) จ่ายแล้วบันทึกครั้งเดียวและส่ง payment_updated
async function verifyOmiseCharge(chargeId: string): Promise<GatewayProcessResult> {
  const existing = await requireOmiseGatewayCharge(chargeId);
  if (existing.processedAt) return { action: 'already_processed', chargeId, status: existing.status };

  const charge = await omiseApiService.retrieveCharge(chargeId);
  const status = omiseApiService.normalizeChargeStatus(charge);
  if (status === 'successful') return completeSuccessfulGatewayCharge(existing, charge, { processedByPrefix: 'omise_verified' });
  // ยังรอจ่ายอยู่ไม่ต้องบันทึกหรือส่ง event ซ้ำ
  if (status === 'pending') return { action: 'pending', chargeId, status };

  const updated = await chargeRepository.updateGatewayCharge(chargeId, { status, raw: charge });
  appEvents.emit('payment_updated', {
    type: 'payment_updated',
    provider: 'omise',
    chargeId,
    plateNo: existing.plateNo,
    paymentStatus: status,
    gatewayCharge: toGatewayChargeEvent(updated),
    emittedAt: new Date().toISOString(),
  });
  return { action: 'updated', chargeId, status };
}

// Function จำลองว่า Omise charge จ่ายสำเร็จสำหรับ UAT โดยไม่เรียก Omise
async function simulateOmiseChargePaid(rawChargeId: string): Promise<GatewayProcessResult> {
  const { chargeId } = parseWithSchema(chargeIdInputSchema, { chargeId: rawChargeId });

  const existing = await requireOmiseGatewayCharge(chargeId);
  const simulatedCharge: OmiseChargeData = {
    ...(existing.raw || {}),
    id: chargeId,
    object: 'charge',
    status: 'successful',
    paid: true,
    paid_at: new Date().toISOString(),
  };

  return completeSuccessfulGatewayCharge(existing, simulatedCharge, { processedByPrefix: 'omise_simulated' });
}

// Function หา QR (charge แบบ source ที่ยังรอจ่ายและยังไม่หมดอายุ) ล่าสุดของ transaction ใช้เตือนก่อนรับเงินช่องทางอื่น
async function findActiveGatewayCharge(transactionId: string): Promise<ActiveGatewayCharge | null> {
  const charges = await chargeRepository.listPendingGatewayChargesByTransactionId(transactionId);
  const active = charges.find((item) => getChargeExpiresAt(item).getTime() > Date.now());
  return active ? { ...active, expiresAt: getChargeExpiresAt(active).toISOString() } : null;
}

// Function กันรับเงินช่องทางอื่นระหว่างที่ QR ของรายการยังสแกนจ่ายได้ (PromptPay ยกเลิกผ่าน Omise ไม่ได้ ถ้าจ่ายทั้งสองทางต้องคืนเงิน)
async function assertNoActiveGatewayCharge(transactionId: string): Promise<void> {
  const charge = await findActiveGatewayCharge(transactionId);
  if (!charge) return;
  throw new ApiError(409, 'PENDING_GATEWAY_CHARGE', 'A QR payment is still pending for this transaction', {
    chargeId: charge.chargeId,
    method: charge.method,
    channel: charge.channel,
    amount: charge.amount,
    expiresAt: charge.expiresAt,
  });
}

// Function บันทึกว่า Admin คืนเงินของ charge นี้แล้ว (PromptPay คืนผ่าน Omise ไม่ได้ ต้องคืนเงินสดหรือโอนเอง)
async function resolveGatewayRefund(chargeId: string, { note = null, resolvedBy = null }: RefundActionInput = {}): Promise<GatewayChargeApi | null> {
  const gatewayCharge = await requireOmiseGatewayCharge(chargeId);
  if (!((gatewayCharge.refundAmount ?? 0) > 0)) throw new ApiError(400, 'REFUND_NOT_REQUIRED', 'This charge does not require a refund');

  // บันทึกแบบมีเงื่อนไข ถ้ากด resolve พร้อมกันหลายที่ สำเร็จได้ครั้งเดียวและส่ง refund_resolved ครั้งเดียว
  const resolved = await chargeRepository.resolveGatewayChargeRefund(chargeId, { refundNote: note, refundResolvedBy: resolvedBy });
  if (!resolved) throw new ApiError(409, 'REFUND_ALREADY_RESOLVED', 'Refund already resolved');

  const updated = await chargeRepository.getGatewayChargeByChargeId(chargeId);
  if (updated) await emitRefundResolved(updated);
  return updated;
}

// Function ตัด raw (Omise charge ทั้งก้อน เช่นข้อมูลบัตรและ metadata) ออกก่อนส่งให้ Admin หรือ realtime event
function toGatewayChargeEvent(charge: GatewayChargeApi): GatewayChargeEvent;
function toGatewayChargeEvent(charge: GatewayChargeApi | null): GatewayChargeEvent | null;
function toGatewayChargeEvent(charge: GatewayChargeApi | null): GatewayChargeEvent | null {
  if (!charge) return null;
  const { raw: _raw, ...rest } = charge;
  return rest;
}

export {
  assertNoActiveGatewayCharge,
  createOmiseChargeForAdmin,
  createOmiseChargeForClient,
  findActiveGatewayCharge,
  getClientOmiseQrImage,
  getOmiseQrImage,
  processOmiseWebhookEvent,
  resolveGatewayRefund,
  simulateOmiseChargePaid,
  toGatewayChargeEvent,
  verifyOmiseCharge,
};
