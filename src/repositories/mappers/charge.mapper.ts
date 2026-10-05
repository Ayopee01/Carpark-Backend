// Import Library
import type { PaymentGatewayCharge } from '@prisma/client';
// Import Types
import type { GatewayChargeApi, GatewayChargeEvent, OmiseChargeData } from '../../types/shared/payment.type';
// Import Utils
import { toIsoOrNull } from '../../utils/date';

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลง payment gateway charge record เป็นรูปแบบ API
function toGatewayChargeApi(row: PaymentGatewayCharge): GatewayChargeApi;
function toGatewayChargeApi(row: PaymentGatewayCharge | null): GatewayChargeApi | null;
function toGatewayChargeApi(row: PaymentGatewayCharge | null): GatewayChargeApi | null {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    chargeId: row.chargeId,
    transactionId: row.transactionId,
    plateNo: row.plateNo,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
    channel: row.channel,
    status: row.status,
    paidAt: toIsoOrNull(row.paidAt),
    processedAt: toIsoOrNull(row.processedAt),
    // raw คือ Omise charge ที่ระบบบันทึกเองตอนสร้าง/รับ webhook
    raw: (row.raw as unknown as OmiseChargeData | null) ?? null,
    refundAmount: row.refundAmount ?? null,
    refundReason: row.refundReason ?? null,
    refundResolvedAt: toIsoOrNull(row.refundResolvedAt),
    refundNote: row.refundNote ?? null,
    refundResolvedBy: row.refundResolvedBy ?? null,
    refundMethod: row.refundMethod ?? null,
    refundId: row.refundId ?? null,
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  };
}

// Function ตัด raw (Omise charge ทั้งก้อน เช่นข้อมูลบัตรและ metadata) ออกก่อนส่งผ่าน realtime event
function toGatewayChargeEvent(charge: GatewayChargeApi | null): GatewayChargeEvent | null {
  if (!charge) return null;
  const { raw: _raw, ...rest } = charge;
  return rest;
}

export { toGatewayChargeApi, toGatewayChargeEvent };
