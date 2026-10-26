// Import Library
import { z } from 'zod';

/* -------------------------------------- Formats -------------------------------------- */

// Format env ตัวเลขจำนวนเต็มตามช่วงที่กำหนด (ค่าผิดใช้ข้อความ message เดียวกันทุกกรณี)
function integerEnv(message: string, { min = 1, max }: { min?: number; max?: number } = {}) {
  const schema = z.coerce.number({ error: message }).int({ error: message }).min(min, { error: message });
  return max === undefined ? schema : schema.max(max, { error: message });
}

// Format env จำนวนเต็มบวก
function positiveIntegerEnv(name: string, unit?: string) {
  return integerEnv(`${name} must be a positive integer${unit ? ` (${unit})` : ''}`);
}

// Format env รายการ origin คั่นด้วย comma (ตัดช่องว่างและค่าว่างออก)
function originListEnv() {
  return z.string().transform((raw) => raw.split(',').map((origin) => origin.trim()).filter(Boolean));
}

/* -------------------------------------- Config -------------------------------------- */

// Config ค่า secret ตัวอย่างที่ห้ามใช้ใน production เพราะใครก็ปลอม token ได้
const PLACEHOLDER_SECRETS = new Set(['change-me', 'dev-token-secret-change-me', 'your_auth_secret']);

// Config schema ของ env ที่ API บังคับตั้งใน .env (ทุกตัวไม่มีค่า default ไม่ได้ตั้ง = "<NAME> is required")
const ENV_SCHEMAS = {
  PORT: positiveIntegerEnv('PORT'),
  DATABASE_URL: z.string(),
  TRUST_PROXY: integerEnv('TRUST_PROXY must be an integer greater than or equal to 0', { min: 0 }),
  AUTH_TOKEN_SECRET: z.string().refine((secret) => process.env.NODE_ENV !== 'production' || !PLACEHOLDER_SECRETS.has(secret), {
    error: 'AUTH_TOKEN_SECRET must be set to a real secret in production',
  }),
  ADMIN_ORIGINS: originListEnv().refine((origins) => origins.length > 0 && !origins.includes('*'), { error: 'ADMIN_ORIGINS must list exact origins (no *)' }),
  CLIENT_ORIGINS: z.union([z.literal('*'), originListEnv()]),
  REALTIME_PING_INTERVAL_MS: positiveIntegerEnv('REALTIME_PING_INTERVAL_MS', 'milliseconds'),
  LOGIN_RATE_LIMIT: positiveIntegerEnv('LOGIN_RATE_LIMIT'),
  ACTIVATION_RATE_LIMIT: positiveIntegerEnv('ACTIVATION_RATE_LIMIT'),
  PUBLIC_CLIENT_RATE_LIMIT: positiveIntegerEnv('PUBLIC_CLIENT_RATE_LIMIT'),
  DEVICE_AUTH_RATE_LIMIT: positiveIntegerEnv('DEVICE_AUTH_RATE_LIMIT'),
  // Omise รับอายุ QR ได้ไม่เกิน 24 ชม.
  OMISE_QR_EXPIRY_MINUTES: integerEnv('OMISE_QR_EXPIRY_MINUTES must be an integer between 1 and 1440', { min: 1, max: 24 * 60 }),
  OMISE_CURRENCY: z.string().regex(/^[a-z]{3}$/i, { error: 'OMISE_CURRENCY must be a 3-letter currency code such as thb' }).transform((code) => code.toLowerCase()),
};

/* -------------------------------------- Functions -------------------------------------- */

// Function อ่านและตรวจ env ที่บังคับตั้งด้วย zod schema ไม่ได้ตั้งหรือค่าผิดให้ throw (อ่านใหม่ทุกครั้งที่เรียก)
function requireEnv<TName extends keyof typeof ENV_SCHEMAS>(name: TName): z.output<(typeof ENV_SCHEMAS)[TName]> {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is required`);

  const result = ENV_SCHEMAS[name].safeParse(raw);
  if (!result.success) throw new Error(result.error.issues[0]?.message || `${name} is invalid`);
  return result.data as z.output<(typeof ENV_SCHEMAS)[TName]>;
}

export { requireEnv };
