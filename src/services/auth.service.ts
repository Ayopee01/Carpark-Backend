// Import Repositories
import * as sessionsRepository from '../repositories/sessions.repository';
import * as usersRepository from '../repositories/users.repository';
// Import Library
import type { AuthSession } from '@prisma/client';
// Import Mappers
import { toUserApi } from '../repositories/mappers/user.mapper';
// Import Types
import type { AuthSessionResult, AuthTokensResponse, CookieSessionResponse, LogoutTokens, SafeUser } from '../types/auth.type';
import type { Permission, UserApi } from '../types/shared/user.type';
// Import Validation
import { loginBodySchema } from '../validation/auth.schema';
import { parseWithSchema } from '../validation/zod';
// Import Utils
import { ApiError } from '../utils/api-error';
import { emitSessionRevoked } from '../utils/events';
import { createId } from '../utils/id';
import { createToken, hashToken, verifyPassword, verifyToken } from '../utils/crypto';

/* -------------------------------------- Config -------------------------------------- */

// Config อายุ token และ session (วินาที): session หมดเมื่อไม่ได้ refresh เกิน idle หรือครบ max นับจาก login
const AUTH_DEFAULTS = {
  accessTokenTtlSeconds: 60 * 60,
  sessionIdleTtlSeconds: 60 * 60,
  sessionMaxTtlSeconds: 12 * 60 * 60,
};

// Config ช่วงเวลาหลัง rotate ที่ refresh token เดิมถูกส่งซ้ำได้โดยไม่ revoke session (เช่น retry ตอน response หาย หรือหลาย tab)
const REFRESH_REUSE_GRACE_MS = 30 * 1000;

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตัดข้อมูล user ให้เหลือเฉพาะ field ที่ frontend ใช้หลัง login
function toSafeUser(user: UserApi): SafeUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    status: user.status,
  };
}

// Function คำนวณจำนวนวินาทีที่เหลือถึงเวลาที่กำหนด (อย่างน้อย 1 วินาที)
function secondsUntil(date: Date | string, now: Date): number {
  return Math.max(1, Math.floor((new Date(date).getTime() - now.getTime()) / 1000));
}

// Function คำนวณเวลาหมดอายุแบบ idle ใหม่ (ไม่เกินเพดานอายุของ session)
function getNextIdleExpiresAt(expiresAt: Date | string, now: Date): Date {
  return new Date(Math.min(now.getTime() + AUTH_DEFAULTS.sessionIdleTtlSeconds * 1000, new Date(expiresAt).getTime()));
}

// Function สร้าง refresh token ผูกกับ user และ session ให้หมดอายุพร้อม idle ของ session
function createRefreshToken(userId: string, sessionId: string, idleExpiresAt: Date, now: Date): string {
  return createToken({ type: 'refresh', sub: userId, sid: sessionId }, secondsUntil(idleExpiresAt, now));
}

// Function สร้าง response ของ login/refresh พร้อม access token ที่อายุไม่เกินเพดานของ session
function toAuthResponse(user: SafeUser | UserApi, sessionId: string, refreshToken: string, { idleExpiresAt, expiresAt }: { idleExpiresAt: Date; expiresAt: Date }, now: Date): AuthTokensResponse {
  const expiresIn = Math.min(AUTH_DEFAULTS.accessTokenTtlSeconds, secondsUntil(expiresAt, now));

  return {
    token: createToken({ type: 'access', sub: user.id, sid: sessionId }, expiresIn),
    refreshToken,
    expiresIn,
    refreshExpiresIn: secondsUntil(idleExpiresAt, now),
    sessionExpiresAt: new Date(expiresAt).toISOString(),
    user,
  };
}

// Function หาเหตุผลที่ session ใช้งานต่อไม่ได้ (null คือยังใช้งานได้)
function getSessionEndReason(session: AuthSession | null, now: Date = new Date()): string | null {
  if (!session) return 'session_not_found';
  if (session.revokedAt) return 'session_revoked';
  if (session.expiresAt <= now) return 'session_expired';
  if (session.idleExpiresAt <= now) return 'session_idle_expired';
  return null;
}

// Function หา session ที่ยังใช้งานได้ (ไม่ถูก revoke และยังไม่หมดอายุทั้งแบบ idle และเพดาน)
async function findActiveSession(sessionId: string, now: Date = new Date()): Promise<AuthSession | null> {
  const session = await sessionsRepository.findSessionById(sessionId);
  return getSessionEndReason(session, now) ? null : session;
}

// Function ยกเลิก session เพื่อไม่ให้ token ของ session นี้ใช้ต่อได้
async function revokeSession(sessionId: string): Promise<AuthSession | null> {
  const session = await sessionsRepository.findSessionById(sessionId);
  if (!session || session.revokedAt) return session;
  return sessionsRepository.updateSession(sessionId, { revokedAt: new Date() });
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจ username/password แล้วสร้าง session พร้อม access/refresh token
async function login(body: unknown, { userAgent, ipAddress }: { userAgent?: string | null; ipAddress?: string | null } = {}): Promise<AuthSessionResult> {
  const { username, password, rememberMe = false } = parseWithSchema(loginBodySchema, body);
  const userRecord = await usersRepository.findActiveUserWithPasswordByUsername(username);
  if (!userRecord || !(await verifyPassword(password, userRecord.passwordHash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  const user = toUserApi(userRecord);
  const now = new Date();
  const sessionId = createId('sess');
  const expiresAt = new Date(now.getTime() + AUTH_DEFAULTS.sessionMaxTtlSeconds * 1000);
  const idleExpiresAt = getNextIdleExpiresAt(expiresAt, now);
  const refreshToken = createRefreshToken(user.id, sessionId, idleExpiresAt, now);
  await sessionsRepository.createSession({
    id: sessionId,
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
    rememberMe,
    lastUsedAt: now,
    idleExpiresAt,
    expiresAt,
  });

  return { ...toAuthResponse(toSafeUser(user), sessionId, refreshToken, { idleExpiresAt, expiresAt }, now), rememberMe };
}

// Function ออกจากระบบด้วย token ที่มี (access token ก่อน ถ้าหมดอายุใช้ refresh token) ไม่มี token ที่ใช้ได้ก็ตอบสำเร็จ (idempotent)
async function logoutWithTokens({ accessToken, refreshToken }: LogoutTokens = {}): Promise<{ message: string }> {
  const access = verifyToken(accessToken);
  const refreshPayload = access?.type === 'access' && access.sid ? null : verifyToken(refreshToken);
  const sessionId = access?.type === 'access' ? access.sid : refreshPayload?.type === 'refresh' ? refreshPayload.sid : null;
  return logout(sessionId);
}

// Function ออกจากระบบโดย revoke session ปัจจุบัน และแจ้ง SSE ของ session นี้ให้ปิด
async function logout(sessionId: string | null | undefined): Promise<{ message: string }> {
  if (sessionId) {
    await revokeSession(sessionId);
    emitSessionRevoked({ sessionId, reason: 'logout' });
  }
  return { message: 'Logged out successfully' };
}

// Function ตรวจ refresh token และออก token ชุดใหม่ พร้อมต่ออายุ idle ของ session (token เก่าที่ส่งซ้ำหลังพ้น grace จะ revoke session)
async function refresh(body: { refreshToken?: unknown } | null | undefined): Promise<AuthSessionResult> {
  const refreshToken = body?.refreshToken;
  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh' || !payload.sub || !payload.sid) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  const user = await usersRepository.findUserById(payload.sub);
  if (!user || user.status !== 'active') throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');

  const now = new Date();
  const session = await findActiveSession(payload.sid, now);
  if (!session) throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
  const currentHash = hashToken(String(refreshToken));
  if (session.refreshTokenHash !== currentHash) {
    // token เพิ่งถูก rotate ไม่นาน ถือว่าเป็น retry/อีก tab ไม่ใช่การขโมย token จึงไม่ revoke session
    const rotatedRecently = now.getTime() - new Date(session.lastUsedAt).getTime() < REFRESH_REUSE_GRACE_MS;
    if (!rotatedRecently) {
      await revokeSession(payload.sid);
      emitSessionRevoked({ sessionId: payload.sid, userId: user.id, reason: 'refresh_token_reused' });
    }
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  const idleExpiresAt = getNextIdleExpiresAt(session.expiresAt, now);
  const nextRefreshToken = createRefreshToken(user.id, payload.sid, idleExpiresAt, now);
  // เปลี่ยน hash แบบมีเงื่อนไข ถ้ามี request อื่น rotate ไปก่อน request นี้จะไม่ได้ token ใหม่
  const rotated = await sessionsRepository.rotateSessionRefreshToken(payload.sid, currentHash, { refreshTokenHash: hashToken(nextRefreshToken), lastUsedAt: now, idleExpiresAt });
  if (!rotated) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');

  return { ...toAuthResponse(user, payload.sid, nextRefreshToken, { idleExpiresAt, expiresAt: session.expiresAt }, now), rememberMe: Boolean(session.rememberMe) };
}

// Function ตรวจว่า refresh token ที่ถูกปฏิเสธเป็นการส่งซ้ำในช่วงผ่อนผัน (session ยังใช้ได้ อีกแท็บเพิ่ง rotate) จึงไม่ควรลบ cookie
async function isRefreshGraceRetry(refreshToken: unknown): Promise<boolean> {
  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh' || !payload.sid) return false;
  return Boolean(await findActiveSession(payload.sid));
}

// Function แปลงผล login/refresh เป็น response แบบ Bearer (client อื่น/Postman) ตัด rememberMe ภายในออก
function toBearerResponse({ rememberMe: _rememberMe, ...tokens }: AuthSessionResult): AuthTokensResponse {
  return tokens;
}

// Function แปลงผล login/refresh เป็น response โหมด cookie (Admin Frontend) ไม่มี token ใน body
function toCookieSessionResponse({ user, expiresIn, refreshExpiresIn, sessionExpiresAt }: AuthSessionResult): CookieSessionResponse {
  return { user, expiresIn, refreshExpiresIn, sessionExpiresAt };
}

// Function ตรวจ access token และ session คืน user ที่ active พร้อม sessionId
async function authenticateAccessToken(token: unknown): Promise<{ user: UserApi; sessionId: string }> {
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'access' || !payload.sub || !payload.sid) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  }

  const [session, user] = await Promise.all([findActiveSession(payload.sid), usersRepository.findUserById(payload.sub)]);
  if (!session || session.userId !== payload.sub) throw new ApiError(401, 'INVALID_SESSION', 'Invalid or expired session');
  if (!user || user.status !== 'active') throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token');

  return { user, sessionId: payload.sid };
}

// Function ตรวจว่า session ของ SSE/WebSocket ยังใช้งานได้ คืนเหตุผลที่ใช้ไม่ได้ (null คือยังใช้งานได้, forbidden = user ไม่มี permission ที่ส่งมา)
async function getSessionEndReasonById(sessionId: string, userId: string, { permission }: { permission?: Permission } = {}): Promise<string | null> {
  const [session, user] = await Promise.all([sessionsRepository.findSessionById(sessionId), usersRepository.findUserById(userId)]);
  if (!user) return 'user_deleted';
  if (user.status !== 'active') return 'user_disabled';
  const sessionEndReason = getSessionEndReason(session);
  if (sessionEndReason) return sessionEndReason;
  if (permission && !(Array.isArray(user.permissions) && user.permissions.includes(permission))) return 'forbidden';
  return null;
}

// Function หาเหตุผลที่ access token ใช้ไม่ได้: invalid_token = token ผิดหรือหมดอายุ (refresh แล้วลองใหม่ได้) ค่าอื่นคือ session จบแล้ว
async function getAccessTokenEndReason(token: unknown): Promise<string> {
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'access' || !payload.sub || !payload.sid) return 'invalid_token';
  return (await getSessionEndReasonById(payload.sid, payload.sub)) ?? 'invalid_token';
}

export { authenticateAccessToken, getAccessTokenEndReason, getSessionEndReasonById, isRefreshGraceRetry, login, logout, logoutWithTokens, refresh, toBearerResponse, toCookieSessionResponse };
