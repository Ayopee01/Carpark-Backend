// Import Library
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Options } from 'express-rate-limit';

/* -------------------------------------- Config -------------------------------------- */

// Config response เมื่อเรียกถี่เกินกำหนด
const TOO_MANY_REQUESTS = { message: 'Too many requests. Please try again later.', code: 'TOO_MANY_REQUESTS' };

// Config ค่ากลางของทุก rate limit (ส่ง RateLimit header ตาม draft-8)
const BASE_OPTIONS: Partial<Options> = { standardHeaders: 'draft-8', legacyHeaders: false };

/* -------------------------------------- Functions -------------------------------------- */

// Function middleware จำกัด login ที่ล้มเหลวต่อ ip + username ใน 15 นาที
const loginRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.username || '').trim().toLowerCase() || 'unknown'}`,
  message: { message: 'Too many login attempts. Please try again later.', code: 'TOO_MANY_LOGIN_ATTEMPTS' },
});

// Function middleware จำกัดการเดา activation code ของ kiosk/barrier gate ต่อ ip ใน 15 นาที
const activationRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.ACTIVATION_RATE_LIMIT),
  message: TOO_MANY_REQUESTS,
});

// Function middleware จำกัด client lookup/payment ต่อ ip ต่อนาที (ข้ามอุปกรณ์ที่ผ่าน device auth เพราะหลายเครื่องอาจใช้ IP เดียวกัน)
const publicClientRateLimit = rateLimit({
  ...BASE_OPTIONS,
  windowMs: 60 * 1000,
  limit: Number(process.env.PUBLIC_CLIENT_RATE_LIMIT),
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

export { activationRateLimit, chargeVerifyRateLimit, loginRateLimit, publicClientRateLimit };
