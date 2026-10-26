// Import Repositories
import { client } from './shared/repository-utils';
import { toGatewayChargeApi } from './shared/charge.repository';
// Import Types
import type { DbClient } from '../types/shared/common.type';
import type { GatewayChargeApi } from '../types/shared/payment.type';

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง gateway charge ที่ต้องคืนเงิน (resolved=false คือยังไม่คืน, true คือคืนแล้ว)
async function listRefundGatewayCharges({ resolved = false }: { resolved?: boolean } = {}, connection?: DbClient): Promise<GatewayChargeApi[]> {
  const rows = await client(connection).paymentGatewayCharge.findMany({
    where: { refundAmount: { gt: 0 }, refundResolvedAt: resolved ? { not: null } : null },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((row) => toGatewayChargeApi(row));
}

export { listRefundGatewayCharges };
