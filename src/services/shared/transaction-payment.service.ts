// Import Library
import type { Prisma, Transaction } from '@prisma/client';
import { addMinutes } from 'date-fns';
// Import Config
import { withTransaction } from '../../db/prisma';
// Import Repositories
import * as transactionsRepository from '../../repositories/transactions.repository';
// Import Mappers
import { toJsonArray, toTransactionApi } from '../../repositories/mappers/transaction.mapper';
// Import Services
import * as paymentSelectionService from './payment-selection.service';
import * as transactionLookupService from './transaction-lookup.service';
// Import Types
import type { DbClient } from '../../types/shared/common.type';
import type { SystemSettings } from '../../types/shared/config.type';
import type { PaymentRecord, ProcessPaymentInput, ProcessPaymentResult } from '../../types/shared/transaction.type';
// Import Validation
import { PAYMENT_EXIT_WINDOW_RANGE } from '../../validation/system-settings.schema';
import { TRANSACTION_ERROR_CODES, requestedAmountInputSchema } from '../../validation/transactions.schema';
import { parseWithSchema } from '../../validation/zod';
// Import Utils
import { ApiError } from '../../utils/api-error';
import { toIsoOrNull } from '../../utils/date';
import { emitDashboardUpdated } from '../../utils/events';
import { createId } from '../../utils/id';
import { isGatePaymentSource, resolvePaymentSource } from '../../utils/payment-source';
import { roundMoney, subtractMoney, sumMoney } from '../../utils/money';
import { calculateFee } from '../../utils/pricing';

/* -------------------------------------- Config -------------------------------------- */

// Config เวลาที่ให้ออกจากลานหลังจ่ายเงิน (นาที) เมื่อ system settings ไม่ได้กำหนดหรือค่าอยู่นอกช่วงที่รองรับ
const DEFAULT_PAYMENT_EXIT_WINDOW_MINUTES = 30;

/* -------------------------------------- Helpers -------------------------------------- */

// Function อ่านเวลาออกจากลานหลังจ่ายเงิน (นาที) จาก system settings ถ้าค่าผิดใช้ค่า default
function getExitWindowMinutes(systemSettings: Partial<SystemSettings> | null | undefined): number {
  const value = Number(systemSettings?.receipt?.paymentBill?.expiryDuration);
  const valid = Number.isInteger(value) && value >= PAYMENT_EXIT_WINDOW_RANGE.min && value <= PAYMENT_EXIT_WINDOW_RANGE.max;
  return valid ? value : DEFAULT_PAYMENT_EXIT_WINDOW_MINUTES;
}

// Function แปลง amount ที่ส่งมาเป็นตัวเลข (รับเฉพาะ number หรือ string ตัวเลขที่มากกว่า 0) ถ้าผิด throw INVALID_AMOUNT
function parseRequestedAmount(amount: unknown): number {
  return roundMoney(parseWithSchema(requestedAmountInputSchema, { amount }, { codes: TRANSACTION_ERROR_CODES.requestedAmount }).amount);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function บันทึกการชำระเงิน (ไม่ส่ง amount = จ่ายยอดค้างทั้งหมด, gatewayCollected = เงินที่ gateway เก็บแล้ว รับยอดเกินได้และไม่ตรวจ payment settings ซ้ำ)
async function processPayment(id: string | null, { plateNo, method, channel, source, paymentSource, sourceContext, routeType, amount, reference = null, terminalId = null, edcDeviceId = null, edcVerification = null, gatewayCollected = false, processedBy, device }: ProcessPaymentInput = {}, connection?: DbClient): Promise<ProcessPaymentResult | null> {
  const context = await transactionLookupService.getTransactionContext();
  const exitWindowMinutes = getExitWindowMinutes(context.systemSettings);
  const paymentMethod = method || 'cash';
  const resolvedPayment = resolvePaymentSource({ source, paymentSource, routeType, channel, processedBy, device, sourceContext });
  const paymentChannel = resolvedPayment.channel;
  const requestedAmount = amount !== undefined && amount !== null ? parseRequestedAmount(amount) : null;

  // เงินที่ gateway เก็บแล้วต้องบันทึกได้เสมอ แม้ admin จะปิด method หลังสร้าง charge (ตรวจไปแล้วตอนสร้าง charge)
  if (!gatewayCollected) await paymentSelectionService.assertPaymentSelection(paymentChannel, paymentMethod);

  let duplicate = false;
  const savePayment = async (tx: DbClient): Promise<Transaction | null> => {
    // มี reference ให้หารายการที่ปิดแล้วด้วย เพื่อจับ request ที่ส่งซ้ำหลังรายการถูกปิด (เช่นจ่ายที่ไม้กั้นแล้วปิดทันที)
    const found = id
      ? await transactionLookupService.findTransactionByIdOrPlateNo(id, { payableOnly: !reference }, tx)
      : await transactionsRepository.findLatestExactTransactionByPlateNo(plateNo, { payableOnly: !reference }, tx);
    if (!found) return null;

    // ล็อก row จนจบ transaction ให้การจ่ายพร้อมกันทำทีละรายการ (กันเขียน payments ทับกัน) แล้วตรวจสถานะซ้ำหลังล็อก
    const transaction = await transactionsRepository.lockTransactionById(found.id, tx);
    if (!transaction) return null;
    // reference เดิม (เช่นเลขอนุมัติ EDC ของเครื่องเดิม) ถูกบันทึกในรายการนี้แล้ว แปลว่าเป็น request ที่ส่งซ้ำ คืนรายการเดิมโดยไม่บันทึกซ้ำ
    const isSameReference = (payment: PaymentRecord): boolean => payment.reference === reference && (payment.terminalId ?? null) === (terminalId ?? null);
    if (reference && toJsonArray(transaction.payments).some(isSameReference)) {
      duplicate = true;
      return transaction;
    }
    if (reference) {
      // เลขอ้างอิงหนึ่งใบใช้ได้กับรายการเดียว กันการใช้สลิปใบเดียวปล่อยรถหลายคัน (ล็อกเลขนี้ไว้กันสองรายการบันทึกพร้อมกัน)
      await transactionsRepository.lockPaymentReference({ reference, terminalId }, tx);
      if (await transactionsRepository.findTransactionIdByPaymentReference({ reference, terminalId }, transaction.id, tx)) {
        throw new ApiError(409, 'PAYMENT_REFERENCE_USED', 'This payment reference was already used for another transaction');
      }
    }
    if (!transactionLookupService.isPayableTransaction(transaction)) return null;

    const paidAt = new Date().toISOString();
    const feeResult = calculateFee(toIsoOrNull(transaction.entryAt), paidAt, context.pricingConfig?.pricingRules || [], {
      vehicleType: transaction.vehicleType,
    });

    const currentNetAmount = feeResult.totalAmount;
    const currentTotalPaid = Number(transaction.totalPaid ?? 0);
    const currentRemaining = Math.max(0, subtractMoney(currentNetAmount, currentTotalPaid));
    const expiryAt = addMinutes(paidAt, exitWindowMinutes).toISOString();

    const payAmount = requestedAmount ?? currentRemaining;
    if (payAmount <= 0) throw new ApiError(400, 'NO_REMAINING_AMOUNT', 'No payable amount remaining');
    if (payAmount > currentRemaining && !gatewayCollected) {
      throw new ApiError(400, 'AMOUNT_EXCEEDS_REMAINING', 'amount exceeds remaining amount', { remainingAmount: currentRemaining });
    }

    const newPayment: PaymentRecord = {
      id: createId('pay'),
      method: paymentMethod,
      channel: paymentChannel,
      source: resolvedPayment.source,
      sourceContext: resolvedPayment.sourceContext,
      paidAmount: payAmount,
      paidAt,
      expiryAt,
      processedBy: processedBy || (resolvedPayment.source === 'admin' ? 'admin' : 'system'),
      ...(reference ? { reference } : {}),
      ...(terminalId ? { terminalId } : {}),
      ...(edcDeviceId ? { edcDeviceId } : {}),
      ...(edcVerification ? { edcVerification } : {}),
      ...(resolvedPayment.device ? {
        deviceId: resolvedPayment.device.deviceId,
        deviceType: resolvedPayment.device.deviceType,
        deviceName: resolvedPayment.device.deviceName,
        deviceLocation: resolvedPayment.device.deviceLocation,
      } : {}),
    };

    const totalPaid = sumMoney([currentTotalPaid, newPayment.paidAmount]);
    const isFullyPaid = totalPaid >= currentNetAmount;
    const updates: Prisma.TransactionUpdateInput = {
      payments: [...toJsonArray(transaction.payments), newPayment] as unknown as Prisma.InputJsonValue,
      totalPaid,
      // เก็บค่าจอด ณ เวลาจ่ายไว้ ให้ยอดของรายการที่ปิดแล้วไม่เปลี่ยนตามราคาที่แก้ทีหลัง
      amount: currentNetAmount,
      netAmount: currentNetAmount,
      updatedAt: new Date(paidAt),
    };

    // Barrier Gate จ่ายที่ทางออกจึงปิดรายการทันทีเมื่อจ่ายครบ ส่วนช่องทางอื่นต้องออกภายใน exitTimeLimit
    if (isGatePaymentSource(resolvedPayment.source) && isFullyPaid) {
      updates.exitTimeLimit = new Date(paidAt);
      updates.exitAt = new Date(paidAt);
      updates.status = 'completed';
    } else {
      updates.exitTimeLimit = new Date(expiryAt);
      updates.status = isFullyPaid ? 'paid_waiting_exit' : 'partially_paid';
    }

    return transactionsRepository.updateTransactionRecord(transaction.id, updates, tx);
  };

  // ถ้า caller ส่ง connection มา (เช่น webhook) จะบันทึกใน transaction ของ caller และ caller ต้อง emit event หลัง commit เอง
  const saved = connection ? await savePayment(connection) : await withTransaction(savePayment);
  if (!saved) return null;

  if (!connection && !duplicate) emitDashboardUpdated('payment_processed', saved);
  return { ...toTransactionApi(saved, context), ...(duplicate ? { duplicatePayment: true } : {}) };
}

// Function ชำระเงินรายการล่าสุดที่จ่ายได้ของทะเบียนรถ (ทะเบียนต้องตรงทั้งหมด)
async function processPaymentByPlateNo(plateNo: string, options: ProcessPaymentInput = {}): Promise<ProcessPaymentResult | null> {
  return processPayment(null, { ...options, plateNo });
}

export { processPayment, processPaymentByPlateNo };
