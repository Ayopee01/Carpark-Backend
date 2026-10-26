// Import Library
import * as argon2 from '@node-rs/argon2';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
// Import Types
import type { TokenPayload } from '../types/shared/user.type';

/* -------------------------------------- Config -------------------------------------- */

// Config การ hash password ด้วย argon2id ตามค่าที่ OWASP แนะนำ (memory 19 MiB, 2 รอบ, parallelism 1)
// เปลี่ยนค่าได้โดย hash เดิมยังตรวจได้ เพราะ parameter ถูกเก็บไว้ใน hash แต่ละตัว
const PASSWORD_HASH: argon2.Options = {
  algorithm: argon2.Algorithm.Argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

// Config ค่า secret ตัวอย่างที่ห้ามใช้ใน production เพราะใครก็ปลอม token ได้
const PLACEHOLDER_SECRETS = new Set(['change-me', 'dev-token-secret-change-me', 'your_auth_secret']);

// Config secret สำหรับ sign access/refresh token (ต้องตั้งใน .env ทุก environment ห้ามใช้ค่าตัวอย่างใน production)
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || '';
if (!TOKEN_SECRET) throw new Error('AUTH_TOKEN_SECRET is required');
if (process.env.NODE_ENV === 'production' && PLACEHOLDER_SECRETS.has(TOKEN_SECRET)) throw new Error('AUTH_TOKEN_SECRET must be set to a real secret in production');

// Config algorithm ของ JWT (verify รับเฉพาะตัวนี้ กัน token ที่เปลี่ยน alg เป็น none หรืออื่น)
const TOKEN_ALGORITHM = 'HS256' as const;

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจว่า payload ที่ decode ได้มีรูปแบบเป็น token ของระบบ
function isTokenPayload(value: unknown): value is TokenPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.exp === 'number' && typeof payload.type === 'string' && typeof payload.sub === 'string' && typeof payload.sid === 'string';
}

/* -------------------------------------- Functions -------------------------------------- */

// Function hash password ด้วย argon2id พร้อม salt สุ่ม คืนรูปแบบมาตรฐาน $argon2id$v=19$m=...,t=...,p=...$salt$hash
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(String(password), PASSWORD_HASH);
}

// Function ตรวจ password กับ hash ที่เก็บไว้ (argon2 เทียบแบบ timing-safe และอ่าน parameter จาก hash เอง) hash ผิดรูปแบบคืน false
async function verifyPassword(password: string | null | undefined, encoded: string | null | undefined): Promise<boolean> {
  if (!password || !encoded) return false;
  try {
    return await argon2.verify(String(encoded), String(password));
  } catch {
    return false;
  }
}

// Function hash token ด้วย SHA256 ก่อนเก็บลง database
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Function สร้าง JWT (HS256) พร้อม exp, iat และ jti สุ่ม (token ที่ออกในวินาทีเดียวกันจึงไม่ซ้ำ)
function createToken({ type, sub, sid }: Pick<TokenPayload, 'type' | 'sub' | 'sid'>, ttlSeconds: number): string {
  return jwt.sign({ type, sid }, TOKEN_SECRET, { algorithm: TOKEN_ALGORITHM, subject: sub, expiresIn: ttlSeconds, jwtid: crypto.randomUUID() });
}

// Function ตรวจ signature และวันหมดอายุของ JWT คืน payload หรือ null ถ้าไม่ผ่าน
// clockTolerance 1 วินาที = token ยังใช้ได้ตลอดวินาทีที่เท่ากับ exp (หมดอายุเมื่อ exp < now)
function verifyToken(token: unknown): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, TOKEN_SECRET, { algorithms: [TOKEN_ALGORITHM], clockTolerance: 1 });
    return isTokenPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

// Function เทียบ string สองค่าแบบ timing-safe เพื่อไม่ให้เดาค่าจากเวลาตอบกลับ
function timingSafeStringEqual(actual: unknown, expected: unknown): boolean {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export { createToken, hashPassword, hashToken, timingSafeStringEqual, verifyPassword, verifyToken };
