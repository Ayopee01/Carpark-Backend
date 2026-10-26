// Import Repositories
import { client } from './shared/repository-utils';
import { toGatewayChargeApi } from './shared/charge.repository';
// Import Types
import type { DbClient } from '../types/shared/common.type';
import type { GatewayChargeApi } from '../types/shared/payment.type';

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง gateway charge ที่บันทึกว่าคืนเงินแล้วในช่วงเวลา refundResolvedAt (ใหม่สุดก่อน)
async function listResolvedRefundGatewayChargesBetween(startDate: string, endDate: string, connection?: DbClient): Promise<GatewayChargeApi[]> {
  const rows = await client(connection).paymentGatewayCharge.findMany({
    where: { refundAmount: { gt: 0 }, refundResolvedAt: { gte: new Date(startDate), lte: new Date(endDate) } },
    orderBy: { refundResolvedAt: 'desc' },
  });
  return rows.map((row) => toGatewayChargeApi(row));
}

export { listResolvedRefundGatewayChargesBetween };
