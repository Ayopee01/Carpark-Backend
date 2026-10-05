// Import Library
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { AuthSession, User } from '@prisma/client';
// Import Test Helpers
import { fixture, stub } from './support/mock';
// Import Repositories
import * as sessionsRepository from '../src/repositories/sessions.repository';
import * as usersRepository from '../src/repositories/users.repository';
// Import Services
import * as authService from '../src/services/auth.service';
// Import App
import app from '../src/app';
// Import Types
import type { SessionRevokedEvent } from '../src/types/shared/realtime.type';
// Import Utils
import { appEvents } from '../src/utils/events';
import { hashPassword } from '../src/utils/crypto';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Config เวลา login ของ test
const LOGIN_AT = new Date('2026-09-30T08:00:00.000Z');

// Function mock users/sessions repository ด้วยข้อมูลในหน่วยความจำ
async function mockAuthStore(t: TestContext): Promise<{ user: User; sessions: Map<string, AuthSession> }> {
  const user: User = { id: 'u_1', email: null, phone: null, createdAt: LOGIN_AT, updatedAt: LOGIN_AT, username: 'admin', name: 'Admin', role: 'admin', permissions: [], status: 'active', passwordHash: await hashPassword('secret') };
  const sessions = new Map<string, AuthSession>();
  stub(t, usersRepository, { findActiveUserWithPasswordByUsername: async () => user });
  stub(t, usersRepository, { findUserById: async () => user });
  stub(t, sessionsRepository, { createSession: async (data) => sessions.set(data.id, fixture<AuthSession>({ ...data })).get(data.id) });
  stub(t, sessionsRepository, { findSessionById: async (id) => sessions.get(id ?? '') || null });
  stub(t, sessionsRepository, { updateSession: async (id, data) => sessions.set(id, fixture<AuthSession>({ ...sessions.get(id), ...data })).get(id) });
  stub(t, sessionsRepository, { rotateSessionRefreshToken: async (id, currentHash, data) => {
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

/* -------------------------------------- Cookie Mode Tests -------------------------------------- */

// Config origin ของ Admin, Kiosk และเว็บอื่นตาม test.env
const ADMIN = 'http://localhost:3000';
const KIOSK = 'http://localhost:3001';
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

// Function แปลง Set-Cookie ของ response เป็น { ชื่อ cookie: header เต็ม }
function setCookies(res: Response): Record<string, string> {
  return Object.fromEntries(res.headers.getSetCookie().map((cookie) => [cookie.split('=')[0], cookie]));
}

// Function สร้าง header Cookie จาก Set-Cookie ที่ได้
function cookieHeader(cookies: Record<string, string | undefined>): string {
  return Object.values(cookies).filter((cookie): cookie is string => Boolean(cookie)).map((cookie) => cookie.split(';')[0]).join('; ');
}

// Function อ่าน code ของ error response
async function codeOf(res: Response): Promise<string> {
  return ((await res.json()) as { code: string }).code;
}

// Function login ในโหมด cookie แล้วคืน response และ cookie ที่ได้
async function cookieLogin(request: AppRequest, rememberMe = false): Promise<{ res: Response; cookies: Record<string, string> }> {
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { Origin: ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret', rememberMe }),
  });
  return { res, cookies: setCookies(res) };
}

test('CORS answers Admin preflight with credentials and gives other origins no access', async (t) => {
  const request = await startApp(t);
  const preflight = (origin: string, path = '/api/devices') => request(path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });

  const admin = await preflight(ADMIN);
  assert.equal(admin.status, 204);
  assert.equal(admin.headers.get('access-control-allow-origin'), ADMIN);
  assert.equal(admin.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(admin.headers.get('access-control-allow-headers'), 'Content-Type,Last-Event-ID');
  assert.equal(admin.headers.get('access-control-max-age'), '600');
  assert.match(admin.headers.get('vary') ?? '', /Origin/);

  assert.equal((await preflight(EVIL)).headers.get('access-control-allow-origin'), null);
  // Kiosk ได้ CORS เฉพาะ /api/client และไม่มี credentials
  assert.equal((await preflight(KIOSK)).headers.get('access-control-allow-origin'), null);
  const kioskClient = await preflight(KIOSK, '/api/client/transactions');
  assert.equal(kioskClient.headers.get('access-control-allow-origin'), KIOSK);
  assert.equal(kioskClient.headers.get('access-control-allow-credentials'), null);
});

test('cookie login sets HttpOnly cookies without tokens in the body and me reads the cookie', async (t) => {
  await mockAuthStore(t);
  const request = await startApp(t);

  const { res, cookies } = await cookieLogin(request);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['expiresIn', 'refreshExpiresIn', 'sessionExpiresAt', 'user']);
  assert.match(cookies['__Host-cp_access'] ?? '', /; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
  assert.match(cookies['__Secure-cp_refresh'] ?? '', /; Path=\/api\/auth; HttpOnly; Secure; SameSite=Strict$/);
  // rememberMe=false เป็น session cookie (ไม่มีอายุ) จึงหายเมื่อปิด browser
  assert.doesNotMatch(cookies['__Host-cp_access'] ?? '', /Max-Age|Expires/);

  const me = await request('/api/auth/me', { headers: { Origin: ADMIN, Cookie: cookieHeader(cookies) } });
  assert.equal(me.status, 200);
  assert.equal(me.headers.get('access-control-allow-origin'), ADMIN);
  assert.equal(((await me.json()) as { user: { id: string } }).user.id, 'u_1');

  // ไม่มี cookie ได้ 401 ที่มี CORS header ให้ frontend อ่าน code ได้
  const anonymous = await request('/api/auth/me', { headers: { Origin: ADMIN } });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('access-control-allow-origin'), ADMIN);

  // rememberMe=true ให้ cookie มีอายุตาม token
  const remembered = await cookieLogin(request, true);
  assert.match(remembered.cookies['__Host-cp_access'] ?? '', /Max-Age=3600/);
});

test('Bearer clients without Origin still get tokens in the body', async (t) => {
  await mockAuthStore(t);
  const request = await startApp(t);

  const res = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'secret' }) });
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(typeof body.token, 'string');
  assert.equal(typeof body.refreshToken, 'string');
  assert.equal('rememberMe' in body, false);
  assert.deepEqual(res.headers.getSetCookie(), []);
});

test('cookie requests from other origins or with non-JSON bodies are rejected as CSRF', async (t) => {
  await mockAuthStore(t);
  const request = await startApp(t);
  const { cookies } = await cookieLogin(request);
  const write = (origin: string | null, contentType: string) => request('/api/theme', {
    method: 'PUT',
    headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': contentType, Cookie: cookieHeader(cookies) },
    body: '{}',
  });

  const fromKiosk = await write(KIOSK, 'application/json');
  assert.equal(fromKiosk.status, 403);
  assert.equal(await codeOf(fromKiosk), 'CSRF_REJECTED');
  assert.equal(await codeOf(await write(null, 'application/json')), 'CSRF_REJECTED');
  assert.equal((await write(ADMIN, 'text/plain')).status, 415);
  // login จาก origin อื่นถูกปฏิเสธ (login CSRF)
  const otherLogin = await request('/api/auth/login', { method: 'POST', headers: { Origin: KIOSK, 'Content-Type': 'application/json' }, body: '{"username":"admin","password":"secret"}' });
  assert.equal(await codeOf(otherLogin), 'CSRF_REJECTED');
});

test('cookie refresh rotates cookies, keeps them during the grace window and clears them on token reuse', async (t) => {
  await mockAuthStore(t);
  t.mock.timers.enable({ apis: ['Date'], now: LOGIN_AT });
  const request = await startApp(t);
  const { cookies } = await cookieLogin(request, true);
  const refresh = (jar: Record<string, string>) => request('/api/auth/refresh', { method: 'POST', headers: { Origin: ADMIN, Cookie: cookieHeader(jar) } });

  const rotated = await refresh(cookies);
  const next = setCookies(rotated);
  assert.equal(rotated.status, 200);
  assert.notEqual(next['__Secure-cp_refresh'], cookies['__Secure-cp_refresh']);
  // คง rememberMe เดิมของ session
  assert.match(next['__Secure-cp_refresh'] ?? '', /Max-Age=\d+/);

  // ส่ง cookie เก่าซ้ำภายใน 30 วินาที (อีกแท็บ) ได้ 401 แต่ไม่ลบ cookie
  const grace = await refresh(cookies);
  assert.equal(grace.status, 401);
  assert.deepEqual(grace.headers.getSetCookie(), []);

  // เกิน 30 วินาทีถือเป็น token reuse: revoke session และลบ cookie
  t.mock.timers.setTime(LOGIN_AT.getTime() + 31 * 1000);
  const reuse = await refresh(cookies);
  assert.match(setCookies(reuse)['__Host-cp_access'] ?? '', /Max-Age=0/);
  assert.equal(await codeOf(reuse), 'INVALID_REFRESH_TOKEN');
  // ไม่มี cookie เลยได้ SESSION_EXPIRED
  assert.equal(await codeOf(await request('/api/auth/refresh', { method: 'POST', headers: { Origin: ADMIN } })), 'SESSION_EXPIRED');
});

test('cookie logout works with only the refresh cookie and always clears both cookies', async (t) => {
  const { sessions } = await mockAuthStore(t);
  const events: SessionRevokedEvent[] = [];
  const onRevoked = (event: SessionRevokedEvent) => events.push(event);
  appEvents.on('session_revoked', onRevoked);
  t.after(() => appEvents.off('session_revoked', onRevoked));
  const request = await startApp(t);
  const { cookies } = await cookieLogin(request);

  // access cookie หมดอายุแล้ว browser ไม่ส่งมา เหลือแค่ refresh cookie
  const logout = await request('/api/auth/logout', { method: 'POST', headers: { Origin: ADMIN, Cookie: cookieHeader({ refresh: cookies['__Secure-cp_refresh'] }) } });
  const cleared = setCookies(logout);
  assert.equal(logout.status, 200);
  assert.match(cleared['__Host-cp_access'] ?? '', /Max-Age=0/);
  assert.match(cleared['__Secure-cp_refresh'] ?? '', /Max-Age=0; Path=\/api\/auth/);
  const [session] = sessions.values();
  assert.ok(session?.revokedAt);
  assert.deepEqual(events.map((event) => event.reason), ['logout']);

  // logout ซ้ำโดยไม่มี cookie ก็ตอบสำเร็จ
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Origin: ADMIN } })).status, 200);
});
