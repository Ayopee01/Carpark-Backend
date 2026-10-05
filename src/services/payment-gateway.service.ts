// Import Library
import crypto from 'crypto';
// Import Services
import * as omisePaymentService from './shared/omise-payment.service';
import * as omiseService from './shared/omise.service';
// Import Library
import type { IncomingHttpHeaders } from 'http';
// Import Types
import type { GatewayProcessResult, OmiseWebhookEvent } from '../types/shared/payment.type';
// Import Utils
import { ApiError } from '../utils/api-error';

/* -------------------------------------- Config -------------------------------------- */

// ถ้าเปิด simulate-paid ใน production ต้องมี token ไม่งั้นใครก็ mark ว่าจ่ายเงินสำเร็จได้
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_PAYMENT_SIMULATION === 'true' && !process.env.PAYMENT_SIMULATION_TOKEN) {
  throw new Error('PAYMENT_SIMULATION_TOKEN is required when ENABLE_PAYMENT_SIMULATION=true in production');
}

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจ simulation token แบบ timing-safe (ไม่ได้ตั้ง PAYMENT_SIMULATION_TOKEN ถือว่าผ่าน)
function isValidSimulationToken(token: unknown): boolean {
  const expected = process.env.PAYMENT_SIMULATION_TOKEN;
  if (!expected) return true;
  const hash = (value: unknown): Buffer => crypto.createHash('sha256').update(String(value || '')).digest();
  return crypto.timingSafeEqual(hash(token), hash(expected));
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจ signature ของ webhook จาก Omise แล้วประมวลผลสถานะ charge
async function handleOmiseWebhook({ rawBody, headers, body }: { rawBody: string | null | undefined; headers: IncomingHttpHeaders; body: OmiseWebhookEvent | null | undefined }): Promise<{ received: true } & GatewayProcessResult> {
  if (!omiseService.verifyWebhookSignature(rawBody, headers)) {
    throw new ApiError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Omise webhook signature');
  }
  return { received: true as const, ...(await omisePaymentService.processOmiseWebhookEvent(body)) };
}

// Function จำลอง charge จ่ายสำเร็จสำหรับ UAT (ต้องเปิด ENABLE_PAYMENT_SIMULATION และส่ง token ถ้าตั้งไว้)
async function simulatePaid({ token, body }: { token?: string | null; body?: { chargeId?: unknown; simulationToken?: string } | null }): Promise<{ simulated: true } & GatewayProcessResult> {
  if (process.env.ENABLE_PAYMENT_SIMULATION !== 'true') {
    throw new ApiError(403, 'PAYMENT_SIMULATION_DISABLED', 'Payment simulation is disabled');
  }
  if (!isValidSimulationToken(token || body?.simulationToken || '')) {
    throw new ApiError(401, 'INVALID_SIMULATION_TOKEN', 'Invalid payment simulation token');
  }

  const chargeId = body?.chargeId === undefined || body?.chargeId === null ? '' : String(body.chargeId).trim();
  return { simulated: true as const, ...(await omisePaymentService.simulateOmiseChargePaid(chargeId)) };
}

export { handleOmiseWebhook, simulatePaid };
