// Import Library
import crypto from 'crypto';
import { promisify } from 'util';
// Import Types
import type { TokenPayload } from '../types/shared/user.type';

/* -------------------------------------- Config -------------------------------------- */

// Config การ hash password ด้วย PBKDF2 (ต้องตรงกับ hash ที่เก็บใน database และ seed)
const PASSWORD_HASH = {
  scheme: 'pbkdf2_sha256',
  algorithm: 'sha256',
  iterations: 100000,
  keyLength: 32,
} as const;

// Config pbkdf2 แบบ async เพื่อไม่บล็อก event loop ระหว่าง hash password
const pbkdf2 = promisify(crypto.pbkdf2);

// Config ค่า secret ตัวอย่างที่ห้ามใช้ใน production เพราะใครก็ปลอม token ได้
const PLACEHOLDER_SECRETS = new Set(['change-me', 'dev-token-secret-change-me', 'your_auth_secret']);

// Config secret สำหรับ sign access/refresh token (ต้องตั้งใน .env ทุก environment)
const TOKEN_SECRET = (() => {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret) throw new Error('AUTH_TOKEN_SECRET is required');
  if (process.env.NODE_ENV === 'production' && PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error('AUTH_TOKEN_SECRET must be set to a real secret in production');
  }
  return secret;
})();

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลง object เป็น JSON แล้ว encode เป็น base64url
function base64Url(input: unknown): string {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

// Function สร้าง signature ของ payload ด้วย HMAC SHA256
function signPayload(payload: string): string {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
}

// Function ตรวจว่า payload ที่ decode ได้มีรูปแบบเป็น token ของระบบ
function isTokenPayload(value: unknown): value is TokenPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.exp === 'number' && typeof payload.type === 'string';
}

/* -------------------------------------- Functions -------------------------------------- */

// Function hash password พร้อม salt สุ่ม คืนรูปแบบ pbkdf2_sha256:iterations:salt:hash
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await pbkdf2(String(password), salt, PASSWORD_HASH.iterations, PASSWORD_HASH.keyLength, PASSWORD_HASH.algorithm)).toString('hex');
  return `${PASSWORD_HASH.scheme}:${PASSWORD_HASH.iterations}:${salt}:${hash}`;
}

// Function ตรวจ password กับ hash ที่เก็บไว้แบบ timing-safe
async function verifyPassword(password: string | null | undefined, encoded: string | null | undefined): Promise<boolean> {
  if (!password || !encoded) return false;

  const [scheme, iterationsRaw, salt, expectedHash] = String(encoded).split(':');
  if (scheme !== PASSWORD_HASH.scheme || !iterationsRaw || !salt || !expectedHash) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const actualHash = (await pbkdf2(String(password), salt, iterations, PASSWORD_HASH.keyLength, PASSWORD_HASH.algorithm)).toString('hex');
  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

// Function hash token ด้วย SHA256 ก่อนเก็บลง database
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Function สร้าง token รูปแบบ payload.signature พร้อม exp, iat และ nonce
function createToken(payload: Pick<TokenPayload, 'type' | 'sub' | 'sid'>, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const encoded = base64Url({
    ...payload,
    exp: now + ttlSeconds,
    iat: now,
    nonce: crypto.randomBytes(12).toString('hex'),
  });

  return `${encoded}.${signPayload(encoded)}`;
}

// Function ตรวจ signature และวันหมดอายุของ token คืน payload หรือ null ถ้าไม่ผ่าน
function verifyToken(token: unknown): TokenPayload | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(signPayload(encoded));
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!isTokenPayload(payload)) return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

// Function เทียบ string สองค่าแบบ timing-safe เพื่อไม่ให้เดาค่าจากเวลาตอบกลับ
function timingSafeStringEqual(actual: unknown, expected: unknown): boolean {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export { createToken, hashPassword, hashToken, timingSafeStringEqual, verifyPassword, verifyToken };
