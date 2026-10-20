// Import Library
import { ipKeyGenerator, MemoryStore, rateLimit } from 'express-rate-limit';
import type { Options } from 'express-rate-limit';

/* -------------------------------------- Config -------------------------------------- */

// Config response เมื่อเรียกถี่เกินกำหนด
const TOO_MANY_REQUESTS = { message: 'Too many requests. Please try again later.', code: 'TOO_MANY_REQUESTS' };

// Config ค่ากลางของทุก rate limit (ส่ง RateLimit header ตาม draft-8)
const BASE_OPTIONS: Partial<Options> = { standardHeaders: 'draft-8', legacyHeaders: false };

/* -------------------------------------- Helpers -------------------------------------- */

// Function อ่าน env เป็นจำนวนเต็มบวก (ต้องตั้งใน .env) ถ้าไม่ได้ตั้งหรือตั้งผิดให้ error ตั้งแต่ตอน start
function envNumber(name: string): number {
  if (!process.env[name]) throw new Error(`${name} is required`);
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function middleware จำกัด login ที่ล้มเหลวต่อ ip + username ใน 15 นาที
const loginRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 15 * 60 * 1000,
  limit: envNumber('LOGIN_RATE_LIMIT'),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.username || '').trim().toLowerCase() || 'unknown'}`,
  message: { message: 'Too many login attempts. Please try again later.', code: 'TOO_MANY_LOGIN_ATTEMPTS' },
});

// Function middleware จำกัดการเดา activation code ของ kiosk/barrier gate ต่อ ip ใน 15 นาที
const activationRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 15 * 60 * 1000,
  limit: envNumber('ACTIVATION_RATE_LIMIT'),
  message: TOO_MANY_REQUESTS,
});

// Function middleware จำกัด client lookup/payment ต่อ ip ต่อนาที (ข้ามอุปกรณ์ที่ผ่าน device auth เพราะหลายเครื่องอาจใช้ IP เดียวกัน)
const publicClientRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 60 * 1000,
  limit: envNumber('PUBLIC_CLIENT_RATE_LIMIT'),
  skip: (req) => Boolean(req.device),
  message: TOO_MANY_REQUESTS,
});

// Function middleware จำกัดการกดตรวจสอบ charge กับ Omise ได้ 1 ครั้งต่อ charge ทุก 10 วินาที
const chargeVerifyRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 10 * 1000,
  limit: 1,
  keyGenerator: (req) => `charge-verify:${String(req.params.chargeId || '')}`,
  message: { message: 'Charge was verified recently. Please wait before trying again.', code: 'CHARGE_VERIFY_TOO_FREQUENT' },
});

// Function middleware จำกัดการขอ ticket ของ Admin payment WebSocket ต่อ user ต่อนาที (frontend ขอใหม่ทุกครั้งที่ต่อ WebSocket ใหม่)
const socketTicketRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `socket-ticket:${req.user?.id ?? ipKeyGenerator(req.ip ?? '')}`,
  message: TOO_MANY_REQUESTS,
});

// Config นับการยืนยันตัวตนอุปกรณ์ที่ token ผิดใน 15 นาที (นับเฉพาะครั้งที่ผิด จึงใช้ store ตรง ๆ แทน middleware)
// - ต่อ IP + deviceId: DEVICE_AUTH_RATE_LIMIT ครั้ง กันเดา token ของเครื่องหนึ่ง โดยไม่พักตู้อื่นหลัง NAT เดียวกัน
// - ต่อ IP: DEVICE_AUTH_RATE_LIMIT x DEVICE_AUTH_IP_LIMIT_MULTIPLIER ครั้ง กันเดาไล่หลาย deviceId จาก IP เดียว (ครบแล้วพักทั้ง IP)
// window เป็นช่วงคงที่นับจากครั้งแรกที่ผิด request ที่ถูกพักไม่ถูกนับ จึง retry ระหว่างพักไม่ทำให้พักนานขึ้น
// store อยู่ใน memory ของ process ถ้ารัน API หลาย instance แต่ละ instance นับแยกกัน
const DEVICE_AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const DEVICE_AUTH_FAILURE_LIMIT = envNumber('DEVICE_AUTH_RATE_LIMIT');
const DEVICE_AUTH_IP_LIMIT_MULTIPLIER = 10;
const deviceAuthFailureStore = new MemoryStore();
deviceAuthFailureStore.init({ windowMs: DEVICE_AUTH_FAILURE_WINDOW_MS } as Options);

// Function สร้าง key ของตัวนับต่อ IP และต่อ IP + deviceId
function getDeviceAuthKeys(ip: string | undefined, deviceId: string): { ipKey: string; deviceKey: string } {
  const ipKey = `device-auth:${ipKeyGenerator(ip ?? '')}`;
  return { ipKey, deviceKey: `${ipKey}:${deviceId}` };
}

// Function คืนจำนวนวินาทีที่ IP นี้ (หรือ IP + deviceId นี้) ต้องรอเมื่อ token ผิดครบกำหนดแล้ว ยังไม่ครบคืน null
async function getDeviceAuthRetryAfter(ip: string | undefined, deviceId: string): Promise<number | null> {
  const { ipKey, deviceKey } = getDeviceAuthKeys(ip, deviceId);
  const now = Date.now();
  const checks: [string, number][] = [[deviceKey, DEVICE_AUTH_FAILURE_LIMIT], [ipKey, DEVICE_AUTH_FAILURE_LIMIT * DEVICE_AUTH_IP_LIMIT_MULTIPLIER]];
  let retryAfterMs = 0;
  for (const [key, limit] of checks) {
    const info = await deviceAuthFailureStore.get(key);
    // MemoryStore ยังคืนค่าที่หมด window แล้วได้จนกว่าจะล้างรอบถัดไป จึงต้องเทียบ resetTime เอง
    const resetAt = info?.resetTime?.getTime() ?? 0;
    if (info && info.totalHits >= limit && resetAt > now) retryAfterMs = Math.max(retryAfterMs, resetAt - now);
  }
  return retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null;
}

// Function นับ token ผิดหนึ่งครั้งทั้งตัวนับต่อ IP และต่อ IP + deviceId
async function recordDeviceAuthFailure(ip: string | undefined, deviceId: string): Promise<void> {
  const { ipKey, deviceKey } = getDeviceAuthKeys(ip, deviceId);
  await Promise.all([deviceAuthFailureStore.increment(ipKey), deviceAuthFailureStore.increment(deviceKey)]);
}

export { activationRateLimit, chargeVerifyRateLimit, getDeviceAuthRetryAfter, loginRateLimit, publicClientRateLimit, recordDeviceAuthFailure, socketTicketRateLimit };
