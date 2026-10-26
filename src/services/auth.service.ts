// Import Repositories
import * as authRepository from '../repositories/auth.repository';
import * as userRepository from '../repositories/shared/user.repository';
// Import Library
import type { AuthSession } from '@prisma/client';
import { addSeconds, differenceInMilliseconds, differenceInSeconds, min } from 'date-fns';
// Import Types
import type { AuthTokensResponse, LogoutTokens } from '../types/auth.type';
import type { Permission, UserApi } from '../types/shared/user.type';
// Import Validation
import { loginBodySchema } from '../validation/schemas';
import { parseWithSchema } from '../validation/parser';
// Import Utils
import { ApiError } from '../utils/api-error';
import { emitSessionRevoked } from '../utils/events';
import { createId } from '../utils/id';
import { createToken, hashToken, verifyPassword, verifyToken } from '../utils/crypto';
import { logger } from '../utils/logger';

/* -------------------------------------- Config -------------------------------------- */

// Config อายุ token และ session (วินาที): session หมดเมื่อไม่ได้ refresh เกิน idle หรือครบ max นับจาก login
const AUTH_DEFAULTS = {
  accessTokenTtlSeconds: 60 * 60,
  sessionIdleTtlSeconds: 60 * 60,
  sessionMaxTtlSeconds: 12 * 60 * 60,
};

// Config ช่วงเวลาหลัง rotate ที่ refresh token เดิมถูกส่งซ้ำได้โดยไม่ revoke session (เช่น retry ตอน response หาย หรือหลาย tab)
const REFRESH_REUSE_GRACE_MS = 30 * 1000;

// Config การล้าง session เก่า: ลบ session ที่ idle หมดอายุนานเกิน retention ทุก interval (ทำครั้งแรกตอน server start)
const SESSION_CLEANUP = { retentionMs: 7 * 24 * 60 * 60 * 1000, intervalMs: 24 * 60 * 60 * 1000 };

/* -------------------------------------- Helpers -------------------------------------- */

// Function คำนวณจำนวนวินาทีที่เหลือถึงเวลาที่กำหนด (อย่างน้อย 1 วินาที)
function secondsUntil(date: Date | string, now: Date): number {
  return Math.max(1, differenceInSeconds(date, now));
}

// Function คำนวณเวลาหมดอายุแบบ idle ใหม่ (ไม่เกินเพดานอายุของ session)
function getNextIdleExpiresAt(expiresAt: Date | string, now: Date): Date {
  return min([addSeconds(now, AUTH_DEFAULTS.sessionIdleTtlSeconds), expiresAt]);
}

// Function สร้าง refresh token ผูกกับ user และ session ให้หมดอายุพร้อม idle ของ session
function createRefreshToken(userId: string, sessionId: string, idleExpiresAt: Date, now: Date): string {
  return createToken({ type: 'refresh', sub: userId, sid: sessionId }, secondsUntil(idleExpiresAt, now));
}

// Function สร้าง response ของ login/refresh พร้อม access token ที่อายุไม่เกินเพดานของ session
function toAuthResponse(user: UserApi, sessionId: string, refreshToken: string, { idleExpiresAt, expiresAt }: { idleExpiresAt: Date; expiresAt: Date }, now: Date): AuthTokensResponse {
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
  const session = await authRepository.findSessionById(sessionId);
  return getSessionEndReason(session, now) ? null : session;
}

// Function ยกเลิก session เพื่อไม่ให้ token ของ session นี้ใช้ต่อได้
async function revokeSession(sessionId: string): Promise<AuthSession | null> {
  const session = await authRepository.findSessionById(sessionId);
  if (!session || session.revokedAt) return session;
  return authRepository.updateSession(sessionId, { revokedAt: new Date() });
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจ username/password แล้วสร้าง session พร้อม access/refresh token
async function login(body: unknown, { userAgent, ipAddress }: { userAgent?: string | null; ipAddress?: string | null } = {}): Promise<AuthTokensResponse> {
  const { username, password, rememberMe = false } = parseWithSchema(loginBodySchema, body);
  const userRecord = await authRepository.findActiveUserWithPasswordByUsername(username);
  if (!userRecord || !(await verifyPassword(password, userRecord.passwordHash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  const user = userRepository.toUserApi(userRecord);
  const now = new Date();
  const sessionId = createId('sess');
  const expiresAt = addSeconds(now, AUTH_DEFAULTS.sessionMaxTtlSeconds);
  const idleExpiresAt = getNextIdleExpiresAt(expiresAt, now);
  const refreshToken = createRefreshToken(user.id, sessionId, idleExpiresAt, now);
  await authRepository.createSession({
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

  return toAuthResponse(user, sessionId, refreshToken, { idleExpiresAt, expiresAt }, now);
}

// Function ออกจากระบบด้วย token ที่มี (access token ก่อน ถ้าหมดอายุใช้ refresh token) ไม่มี token ที่ใช้ได้ก็ตอบสำเร็จ (idempotent)
async function logoutWithTokens({ accessToken, refreshToken }: LogoutTokens = {}): Promise<{ message: string }> {
  const access = verifyToken(accessToken);
  const refreshPayload = access?.type === 'access' && access.sid ? null : verifyToken(refreshToken);
  const sessionId = access?.type === 'access' ? access.sid : refreshPayload?.type === 'refresh' ? refreshPayload.sid : null;
  return logout(sessionId);
}

// Function ออกจากระบบโดย revoke session ปัจจุบัน และแจ้ง Socket.IO ของ session นี้ให้ปิด
async function logout(sessionId: string | null | undefined): Promise<{ message: string }> {
  if (sessionId) {
    await revokeSession(sessionId);
    emitSessionRevoked({ sessionId, reason: 'logout' });
  }
  return { message: 'Logged out successfully' };
}

// Function ตรวจ refresh token และออก token ชุดใหม่ พร้อมต่ออายุ idle ของ session (token เก่าที่ส่งซ้ำหลังพ้น grace จะ revoke session)
async function refresh(body: { refreshToken?: unknown } | null | undefined): Promise<AuthTokensResponse> {
  const refreshToken = body?.refreshToken;
  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh' || !payload.sub || !payload.sid) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  const user = await userRepository.findUserById(payload.sub);
  if (!user || user.status !== 'active') throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');

  const now = new Date();
  const session = await findActiveSession(payload.sid, now);
  if (!session) throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
  const currentHash = hashToken(String(refreshToken));
  if (session.refreshTokenHash !== currentHash) {
    // token เพิ่งถูก rotate ไม่นาน ถือว่าเป็น retry/อีก tab ไม่ใช่การขโมย token จึงไม่ revoke session
    const rotatedRecently = differenceInMilliseconds(now, session.lastUsedAt) < REFRESH_REUSE_GRACE_MS;
    if (!rotatedRecently) {
      await revokeSession(payload.sid);
      emitSessionRevoked({ sessionId: payload.sid, userId: user.id, reason: 'refresh_token_reused' });
    }
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  const idleExpiresAt = getNextIdleExpiresAt(session.expiresAt, now);
  const nextRefreshToken = createRefreshToken(user.id, payload.sid, idleExpiresAt, now);
  // เปลี่ยน hash แบบมีเงื่อนไข ถ้ามี request อื่น rotate ไปก่อน request นี้จะไม่ได้ token ใหม่
  const rotated = await authRepository.rotateSessionRefreshToken(payload.sid, currentHash, { refreshTokenHash: hashToken(nextRefreshToken), lastUsedAt: now, idleExpiresAt });
  if (!rotated) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');

  return toAuthResponse(user, payload.sid, nextRefreshToken, { idleExpiresAt, expiresAt: session.expiresAt }, now);
}

// Function ตรวจ access token และ session คืน user ที่ active พร้อม sessionId
async function authenticateAccessToken(token: unknown): Promise<{ user: UserApi; sessionId: string }> {
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'access' || !payload.sub || !payload.sid) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  }

  const [session, user] = await Promise.all([findActiveSession(payload.sid), userRepository.findUserById(payload.sub)]);
  if (!session || session.userId !== payload.sub) throw new ApiError(401, 'INVALID_SESSION', 'Invalid or expired session');
  if (!user || user.status !== 'active') throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token');

  return { user, sessionId: payload.sid };
}

// Function ตรวจว่า session ของ Socket.IO ยังใช้งานได้ คืนเหตุผลที่ใช้ไม่ได้ (null คือยังใช้งานได้, forbidden = user ไม่มี permission ที่ส่งมา)
async function getSessionEndReasonById(sessionId: string, userId: string, { permission }: { permission?: Permission } = {}): Promise<string | null> {
  const { reason, permissions } = await getSessionState(sessionId, userId);
  if (reason) return reason;
  if (permission && !permissions.includes(permission)) return 'forbidden';
  return null;
}

// Function อ่านสถานะ session พร้อม permission ล่าสุดของ user (reason null = ยังใช้งานได้) ใช้กับ realtime ที่ต้องตรวจซ้ำเป็นระยะ
async function getSessionState(sessionId: string, userId: string): Promise<{ reason: string | null; permissions: Permission[] }> {
  const [session, user] = await Promise.all([authRepository.findSessionById(sessionId), userRepository.findUserById(userId)]);
  if (!user) return { reason: 'user_deleted', permissions: [] };
  if (user.status !== 'active') return { reason: 'user_disabled', permissions: [] };
  const permissions = (Array.isArray(user.permissions) ? user.permissions : []) as Permission[];
  return { reason: getSessionEndReason(session), permissions };
}

// Function หาเหตุผลที่ access token ใช้ไม่ได้: invalid_token = token ผิดหรือหมดอายุ (refresh แล้วลองใหม่ได้) ค่าอื่นคือ session จบแล้ว
async function getAccessTokenEndReason(token: unknown): Promise<string> {
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'access' || !payload.sub || !payload.sid) return 'invalid_token';
  return (await getSessionEndReasonById(payload.sid, payload.sub)) ?? 'invalid_token';
}

// Function ลบ session ที่หมดอายุหรือถูก revoke นานเกิน retention คืนจำนวนที่ลบ
async function cleanupExpiredSessions(now: Date = new Date()): Promise<number> {
  return authRepository.deleteSessionsIdleExpiredBefore(new Date(now.getTime() - SESSION_CLEANUP.retentionMs));
}

// Function เริ่มล้าง session เก่าตอน server start และทุก interval เพื่อไม่ให้ auth_sessions โตไม่จำกัด
function startSessionCleanupMonitor(): NodeJS.Timeout {
  const run = (): void => {
    cleanupExpiredSessions()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'Expired auth sessions cleaned up');
      })
      .catch((err) => {
        logger.error({ err }, 'Auth session cleanup failed');
      });
  };
  run();
  const interval = setInterval(run, SESSION_CLEANUP.intervalMs);
  interval.unref?.();
  return interval;
}

export { authenticateAccessToken, cleanupExpiredSessions, getAccessTokenEndReason, getSessionEndReasonById, getSessionState, login, logout, logoutWithTokens, refresh, startSessionCleanupMonitor };
