// Import Library
import type { Prisma } from '@prisma/client';
// Import Config
import { prisma } from '../db/prisma';
// Import Mappers
import { toGatewayChargeApi } from './mappers/charge.mapper';
// Import Types
import type { DbClient } from '../types/shared/common.type';
import type { GatewayChargeApi, GatewayChargeInput, GatewayChargeUpdate, RefundActorInput } from '../types/shared/payment.type';
// Import Utils
import { createId } from '../utils/id';

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือก prisma client ปกติ หรือ transaction client ที่ส่งเข้ามา
function client(connection?: DbClient): DbClient {
  return connection ?? prisma;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง payment gateway charge ใหม่ (สถานะเริ่มต้น pending)
async function createGatewayCharge(data: GatewayChargeInput, connection?: DbClient): Promise<GatewayChargeApi> {
  const saved = await client(connection).paymentGatewayCharge.create({
    data: {
      id: createId('pgc'),
      provider: data.provider || 'omise',
      chargeId: data.chargeId,
      transactionId: data.transactionId,
      plateNo: data.plateNo,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      channel: data.channel,
      status: data.status || 'pending',
      raw: (data.raw ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
    },
  });

  return toGatewayChargeApi(saved);
}

// Function สร้าง gateway charge จากข้อมูลที่ Omise คืนมาถ้ายังไม่มี record (มีอยู่แล้วคืน record เดิม)
async function createGatewayChargeIfMissing(data: GatewayChargeInput, connection?: DbClient): Promise<GatewayChargeApi> {
  const saved = await client(connection).paymentGatewayCharge.upsert({
    where: { chargeId: data.chargeId },
    update: {},
    create: {
      id: createId('pgc'),
      provider: data.provider || 'omise',
      chargeId: data.chargeId,
      transactionId: data.transactionId,
      plateNo: data.plateNo,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      channel: data.channel,
      status: data.status || 'pending',
      raw: (data.raw ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
    },
  });

  return toGatewayChargeApi(saved);
}

// Function จอง gateway charge ให้ประมวลผลได้ครั้งเดียว (set processedAt เมื่อยังเป็น null) คืน true ถ้าจองสำเร็จ
async function claimGatewayCharge(chargeId: string, connection?: DbClient): Promise<boolean> {
  const result = await client(connection).paymentGatewayCharge.updateMany({
    where: { chargeId, processedAt: null },
    data: { processedAt: new Date() },
  });
  return result.count === 1;
}

// Function หา payment gateway charge ด้วย chargeId
async function getGatewayChargeByChargeId(chargeId: string | null | undefined, connection?: DbClient): Promise<GatewayChargeApi | null> {
  if (!chargeId) return null;
  return toGatewayChargeApi(await client(connection).paymentGatewayCharge.findUnique({ where: { chargeId } }));
}

// Function แก้ไขสถานะ, raw และเวลาจ่าย/ประมวลผลของ gateway charge ด้วย chargeId
async function updateGatewayCharge(chargeId: string, updates: GatewayChargeUpdate, connection?: DbClient): Promise<GatewayChargeApi | null> {
  if (!chargeId) return null;

  const data: Prisma.PaymentGatewayChargeUpdateInput = {};
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.raw !== undefined) data.raw = updates.raw as unknown as Prisma.InputJsonValue;
  if (updates.paidAt !== undefined) data.paidAt = updates.paidAt ? new Date(updates.paidAt) : null;
  if (updates.processedAt !== undefined) data.processedAt = updates.processedAt ? new Date(updates.processedAt) : null;
  if (updates.refundAmount !== undefined) data.refundAmount = updates.refundAmount;
  if (updates.refundReason !== undefined) data.refundReason = updates.refundReason;
  if (updates.refundResolvedAt !== undefined) data.refundResolvedAt = updates.refundResolvedAt ? new Date(updates.refundResolvedAt) : null;
  if (updates.refundNote !== undefined) data.refundNote = updates.refundNote;
  if (updates.refundResolvedBy !== undefined) data.refundResolvedBy = updates.refundResolvedBy;
  if (updates.refundMethod !== undefined) data.refundMethod = updates.refundMethod;
  if (updates.refundId !== undefined) data.refundId = updates.refundId;

  return toGatewayChargeApi(await client(connection).paymentGatewayCharge.update({ where: { chargeId }, data }));
}

// Function บันทึกว่าพนักงานคืนเงินของ charge เองแล้ว เฉพาะเมื่อยังไม่เคยบันทึก คืน true ถ้าสำเร็จ
async function resolveGatewayChargeRefund(chargeId: string, { refundNote = null, refundResolvedBy = null }: RefundActorInput = {}, connection?: DbClient): Promise<boolean> {
  const result = await client(connection).paymentGatewayCharge.updateMany({
    where: { chargeId, refundAmount: { gt: 0 }, refundResolvedAt: null },
    data: { refundResolvedAt: new Date(), refundNote, refundResolvedBy, refundMethod: 'manual' },
  });
  return result.count === 1;
}

// Function หา gateway charge ที่ยัง pending ของ transaction (ใหม่สุดก่อน) ใช้หา QR เดิมมาใช้ซ้ำ
async function listPendingGatewayChargesByTransactionId(transactionId: string | null | undefined, connection?: DbClient): Promise<GatewayChargeApi[]> {
  if (!transactionId) return [];
  const rows = await client(connection).paymentGatewayCharge.findMany({
    where: { transactionId, status: 'pending', processedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => toGatewayChargeApi(row));
}

// Function ดึง gateway charge ที่ต้องคืนเงิน (resolved=false คือยังไม่คืน, true คือคืนแล้ว)
async function listRefundGatewayCharges({ resolved = false }: { resolved?: boolean } = {}, connection?: DbClient): Promise<GatewayChargeApi[]> {
  const rows = await client(connection).paymentGatewayCharge.findMany({
    where: { refundAmount: { gt: 0 }, refundResolvedAt: resolved ? { not: null } : null },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((row) => toGatewayChargeApi(row));
}

// Function สรุปจำนวนและยอด (สตางค์) ของ gateway charge ที่ยังรอคืนเงิน
async function summarizePendingRefunds(connection?: DbClient): Promise<{ count: number; amount: number }> {
  const result = await client(connection).paymentGatewayCharge.aggregate({
    where: { refundAmount: { gt: 0 }, refundResolvedAt: null },
    _count: { _all: true },
    _sum: { refundAmount: true },
  });
  return { count: result._count._all, amount: result._sum.refundAmount || 0 };
}

export {
  claimGatewayCharge,
  createGatewayCharge,
  createGatewayChargeIfMissing,
  getGatewayChargeByChargeId,
  listPendingGatewayChargesByTransactionId,
  listRefundGatewayCharges,
  resolveGatewayChargeRefund,
  summarizePendingRefunds,
  updateGatewayCharge,
};
