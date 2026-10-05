// Import Repositories
import * as chargesRepository from '../../repositories/charges.repository';
// Import Mappers
import { toGatewayChargeEvent } from '../../repositories/mappers/charge.mapper';
// Import Types
import type { PaymentUpdateEvent } from '../../types/shared/payment.type';
// Import Services
import * as transactionLookupService from './transaction-lookup.service';

/* -------------------------------------- Config -------------------------------------- */

// Config สถานะ gateway ที่ส่งซ้ำให้ client ที่เพิ่ง subscribe (กันพลาด event ที่ส่งไปก่อน reconnect)
const REPLAYABLE_GATEWAY_STATUSES = new Set<string>(['successful', 'failed', 'expired', 'reversed']);

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง snapshot สถานะ payment ล่าสุดของ chargeId คืน null ถ้ายังไม่มีผลที่ควรส่ง
async function buildPaymentUpdateSnapshot(chargeId: string): Promise<PaymentUpdateEvent | null> {
  const gatewayCharge = await chargesRepository.getGatewayChargeByChargeId(chargeId);
  if (!gatewayCharge) return null;
  if (!gatewayCharge.processedAt && !REPLAYABLE_GATEWAY_STATUSES.has(gatewayCharge.status)) return null;

  const transaction = gatewayCharge.transactionId ? await transactionLookupService.getTransactionApiById(gatewayCharge.transactionId) : null;

  return {
    type: 'payment_updated',
    provider: gatewayCharge.provider,
    chargeId: gatewayCharge.chargeId,
    plateNo: transaction?.plateNo || gatewayCharge.plateNo,
    transactionId: transaction?.id || gatewayCharge.transactionId,
    paymentStatus: gatewayCharge.status,
    transactionStatus: transaction?.status || null,
    remainingAmount: transaction?.remainingAmount ?? null,
    exitTimeLimit: transaction?.exitTimeLimit || null,
    refundRequired: (gatewayCharge.refundAmount ?? 0) > 0,
    refundAmount: gatewayCharge.refundAmount || null,
    refundReason: gatewayCharge.refundReason || null,
    gatewayCharge: toGatewayChargeEvent(gatewayCharge),
    replayed: true,
    emittedAt: new Date().toISOString(),
  };
}

export { buildPaymentUpdateSnapshot };
