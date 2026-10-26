// Import Library
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { AuthSession, User } from '@prisma/client';
// Import Test Helpers
import { fixture, stub } from '../support/mock';
// Import Repositories
import * as authRepository from '../../src/repositories/auth.repository';
import * as userRepository from '../../src/repositories/shared/user.repository';
// Import Services
import * as authService from '../../src/services/auth.service';
// Import App
import app from '../../src/app';
// Import Types
import type { SessionRevokedEvent } from '../../src/types/shared/realtime.type';
// Import Utils
import { appEvents } from '../../src/utils/events';
import { hashPassword } from '../../src/utils/crypto';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Config เวลา login ของ test
const LOGIN_AT = new Date('2026-09-30T08:00:00.000Z');

// Function mock users/sessions repository ด้วยข้อมูลในหน่วยความจำ
async function mockAuthStore(t: TestContext): Promise<{ user: User; sessions: Map<string, AuthSession> }> {
  const user: User = { id: 'u_1', email: null, phone: null, createdAt: LOGIN_AT, updatedAt: LOGIN_AT, username: 'admin', name: 'Admin', role: 'admin', permissions: [], status: 'active', passwordHash: await hashPassword('secret') };
  const sessions = new Map<string, AuthSession>();
  stub(t, authRepository, { findActiveUserWithPasswordByUsername: async () => user });
  stub(t, userRepository, { findUserById: async () => user });
  stub(t, authRepository, { createSession: async (data) => sessions.set(data.id, fixture<AuthSession>({ ...data })).get(data.id) });
  stub(t, authRepository, { findSessionById: async (id) => sessions.get(id ?? '') || null });
  stub(t, authRepository, { updateSession: async (id, data) => sessions.set(id, fixture<AuthSession>({ ...sessions.get(id), ...data })).get(id) });
  stub(t, authRepository, { rotateSessionRefreshToken: async (id, currentHash, data) => {
    const session = sessions.get(id);
    if (!session || session.revokedAt || session.refreshTokenHash !== currentHash) return false;
    sessions.set(id, fixture<AuthSession>({ ...session, ...data }));
    return true;
  } });
  return { user, sessions };
}

/* -------------------------------------- Tests -------------------------------------- */

test('login creates a session with 1 hour idle timeout and 12 hour absolute end', async (t) => {
  await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });

  const result = await authService.login({ username: 'admin', password: 'secret' });

  assert.equal(result.expiresIn, 3600);
  assert.equal(result.refreshExpiresIn, 3600);
  assert.equal(result.sessionExpiresAt, '2026-09-30T20:00:00.000Z');
  // user ตอน login มี field เดียวกับ refresh และ GET /api/auth/me และไม่มี passwordHash
  assert.deepEqual(Object.keys(result.user).sort(), ['createdAt', 'email', 'id', 'name', 'permissions', 'phone', 'role', 'status', 'updatedAt', 'username']);
});

test('refresh extends the idle timeout but never past the absolute session end', async (t) => {
  await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });
  let tokens = await authService.login({ username: 'admin', password: 'secret' });

  // refresh ทุก 50 นาทีจนเกือบครบ 12 ชม. session ต้องไม่หลุด
  for (let minutes = 50; minutes <= 11 * 60 + 30; minutes += 50) {
    t.mock.timers.setTime(LOGIN_AT.getTime() + minutes * 60 * 1000);
    tokens = await authService.refresh({ refreshToken: tokens.refreshToken });
  }

  // 11:30 ชม. หลัง login เหลือเวลา session 30 นาที อายุ token ถูกตัดตามเพดาน
  t.mock.timers.setTime(LOGIN_AT.getTime() + (11 * 60 + 30) * 60 * 1000);
  tokens = await authService.refresh({ refreshToken: tokens.refreshToken });
  assert.equal(tokens.expiresIn, 1800);
  assert.equal(tokens.refreshExpiresIn, 1800);

  // ครบ 12 ชม. ต้อง login ใหม่
  t.mock.timers.setTime(LOGIN_AT.getTime() + 12 * 60 * 60 * 1000);
  await assert.rejects(authService.refresh({ refreshToken: tokens.refreshToken }), { statusCode: 401, code: 'SESSION_EXPIRED' });
});

test('refresh rejects a session idle for more than 1 hour', async (t) => {
  const { sessions } = await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });
  const tokens = await authService.login({ username: 'admin', password: 'secret' });

  // เลื่อน idle ให้หมดก่อน token หมดอายุ เพื่อทดสอบการเช็ค idleExpiresAt ของ session
  const [session] = sessions.values();
  session.idleExpiresAt = new Date(LOGIN_AT.getTime() + 30 * 60 * 1000);
  t.mock.timers.setTime(LOGIN_AT.getTime() + 31 * 60 * 1000);

  await assert.rejects(authService.refresh({ refreshToken: tokens.refreshToken }), { code: 'SESSION_EXPIRED' });
});

test('logout and refresh token reuse emit session_revoked for the session', async (t) => {
  await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });
  const events: SessionRevokedEvent[] = [];
  const onRevoked = (event: SessionRevokedEvent) => events.push(event);
  appEvents.on('session_revoked', onRevoked);
  t.after(() => appEvents.off('session_revoked', onRevoked));

  const first = await authService.login({ username: 'admin', password: 'secret' });
  await authService.refresh({ refreshToken: first.refreshToken });
  // ส่ง token เก่าซ้ำหลังพ้น grace 30 วินาที ถือว่า token ถูกขโมย
  t.mock.timers.setTime(LOGIN_AT.getTime() + 31 * 1000);
  await assert.rejects(authService.refresh({ refreshToken: first.refreshToken }), { code: 'INVALID_REFRESH_TOKEN' });

  const second = await authService.login({ username: 'admin', password: 'secret' });
  const { sessionId } = await authService.authenticateAccessToken(second.token);
  await authService.logout(sessionId);

  assert.deepEqual(events.map((event) => event.reason), ['refresh_token_reused', 'logout']);
  assert.equal(events[1]?.sessionId, sessionId);
});

test('refresh token sent again within the grace window is rejected without revoking the session', async (t) => {
  const { sessions } = await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });
  const first = await authService.login({ username: 'admin', password: 'secret' });
  const second = await authService.refresh({ refreshToken: first.refreshToken });

  // retry ของ request เดิม (response หาย) ภายใน grace ไม่ revoke และ token ล่าสุดยังใช้ต่อได้
  await assert.rejects(authService.refresh({ refreshToken: first.refreshToken }), { code: 'INVALID_REFRESH_TOKEN' });
  const [session] = sessions.values();
  assert.equal(session.revokedAt, undefined);
  await authService.refresh({ refreshToken: second.refreshToken });
});

test('getAccessTokenEndReason separates a token to refresh from a session that ended', async (t) => {
  await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });
  const { token } = await authService.login({ username: 'admin', password: 'secret' });
  const { sessionId } = await authService.authenticateAccessToken(token);

  // token ผิดหรือหมดอายุ refresh แล้วลองใหม่ได้ ส่วน session ที่ logout แล้วต้อง login ใหม่
  assert.equal(await authService.getAccessTokenEndReason('not-a-token'), 'invalid_token');
  await authService.logout(sessionId);
  assert.equal(await authService.getAccessTokenEndReason(token), 'session_revoked');
});

test('getSessionEndReasonById returns forbidden when the user lacks the required permission', async (t) => {
  await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });
  const { token } = await authService.login({ username: 'admin', password: 'secret' });
  const { sessionId } = await authService.authenticateAccessToken(token);

  assert.equal(await authService.getSessionEndReasonById(sessionId, 'u_1'), null);
  assert.equal(await authService.getSessionEndReasonById(sessionId, 'u_1', { permission: 'transactions' }), 'forbidden');
});

/* -------------------------------------- HTTP Auth Tests -------------------------------------- */

// Config origin ที่อยู่ใน CORS_ORIGIN ของ test.env และเว็บอื่น
const ADMIN = 'http://localhost:3000';
const EVIL = 'https://evil.example';

// Type function ยิง request ไปที่ app ที่เปิดไว้
type AppRequest = (path: string, init?: RequestInit) => Promise<Response>;

// Function เปิด app จริงบน port ว่าง แล้วคืน function ยิง request (ปิด server ตอนจบ test)
async function startApp(t: TestContext): Promise<AppRequest> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (path, init) => fetch(`${base}${path}`, init);
}

// Function ยิง JSON POST ไปที่ app
function postJson(request: AppRequest, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('CORS allows only origins in CORS_ORIGIN and never sends credentials', async (t) => {
  const request = await startApp(t);
  const preflight = (origin: string) => request('/api/devices', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });

  const admin = await preflight(ADMIN);
  assert.equal(admin.status, 204);
  assert.equal(admin.headers.get('access-control-allow-origin'), ADMIN);
  assert.equal(admin.headers.get('access-control-allow-credentials'), null);
  assert.equal(admin.headers.get('access-control-max-age'), '600');
  assert.equal((await preflight(EVIL)).headers.get('access-control-allow-origin'), null);
});

test('login, me, refresh and logout use Bearer tokens without cookies', async (t) => {
  const { sessions } = await mockAuthStore(t);
  const events: SessionRevokedEvent[] = [];
  const onRevoked = (event: SessionRevokedEvent) => events.push(event);
  appEvents.on('session_revoked', onRevoked);
  t.after(() => appEvents.off('session_revoked', onRevoked));
  const request = await startApp(t);

  const login = await postJson(request, '/api/auth/login', { username: 'admin', password: 'secret' }, { Origin: ADMIN });
  const tokens = (await login.json()) as { token: string; refreshToken: string } & Record<string, unknown>;
  assert.equal(login.status, 200);
  assert.equal(typeof tokens.token, 'string');
  assert.equal(typeof tokens.refreshToken, 'string');
  assert.equal('rememberMe' in tokens, false);
  assert.deepEqual(login.headers.getSetCookie(), []);

  const me = await request('/api/auth/me', { headers: { Authorization: `Bearer ${tokens.token}` } });
  assert.equal(((await me.json()) as { user: { id: string } }).user.id, 'u_1');
  assert.equal((await request('/api/auth/me')).status, 401);

  const refreshed = await postJson(request, '/api/auth/refresh', { refreshToken: tokens.refreshToken });
  const next = (await refreshed.json()) as { refreshToken: string };
  assert.equal(refreshed.status, 200);
  assert.notEqual(next.refreshToken, tokens.refreshToken);

  // access token หมดอายุแล้วก็ logout ด้วย refresh token ใน body ได้
  const logout = await postJson(request, '/api/auth/logout', { refreshToken: next.refreshToken });
  assert.equal(logout.status, 200);
  const [session] = sessions.values();
  assert.ok(session?.revokedAt);
  assert.deepEqual(events.map((event) => event.reason), ['logout']);
  // logout ซ้ำโดยไม่มี token ก็ตอบสำเร็จ
  assert.equal((await postJson(request, '/api/auth/logout', {})).status, 200);
});

test('session cleanup deletes sessions idle-expired more than 7 days ago', async (t) => {
  const cutoffs: Date[] = [];
  stub(t, authRepository, { deleteSessionsIdleExpiredBefore: async (cutoff) => cutoffs.push(cutoff) && 3 });

  assert.equal(await authService.cleanupExpiredSessions(LOGIN_AT), 3);
  assert.deepEqual(cutoffs, [new Date('2026-09-23T08:00:00.000Z')]);
});
