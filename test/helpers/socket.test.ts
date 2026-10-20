// Import Library
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { ClientOptions } from 'ws';
// Import Test Helpers
import { setEnv, stub } from '../support/mock';
// Import Services
import * as authService from '../../src/services/auth.service';
import * as socketTicketService from '../../src/services/shared/socket-ticket.service';
// Import Realtime
import { attachPaymentWebSocket } from '../../src/realtime/socket';
// Import Utils
import { ApiError } from '../../src/utils/api-error';
import { appEvents, emitSessionRevoked } from '../../src/utils/events';

/* -------------------------------------- Types -------------------------------------- */

// Type message ที่ payment WebSocket ส่งมา
interface SocketMessage {
  type: string;
  chargeId?: string;
  [key: string]: unknown;
}

// Type ผลการเปิด WebSocket (message แรก, status ของ handshake ที่ถูกปฏิเสธ, close code หรือ error)
interface ConnectResult {
  ws: WebSocket;
  message?: SocketMessage;
  statusCode?: number;
  close?: SocketClose;
  error?: Error;
}

// Type close code และ reason ที่ server ใช้ปิด WebSocket
interface SocketClose {
  code: number;
  reason: string;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function เปิด HTTP server พร้อม payment WebSocket ทั้ง 2 path แล้วคืน port (ปิด server ตอนจบ test)
async function startSocketServer(t: TestContext, { pingIntervalMs = 60000 }: { pingIntervalMs?: number } = {}): Promise<number> {
  setEnv(t, { REALTIME_PING_INTERVAL_MS: String(pingIntervalMs) });
  const server = http.createServer();
  const sockets = attachPaymentWebSocket(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => {
    Object.values(sockets).forEach((wss) => wss.close());
    server.close();
  });
  return (server.address() as AddressInfo).port;
}

// Function เปิด WebSocket แล้วรอ message แรก, close code หรือ error ของ handshake
function connect(url: string, options?: ClientOptions): Promise<ConnectResult> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, options);
    ws.once('message', (message) => resolve({ ws, message: JSON.parse(String(message)) as SocketMessage }));
    ws.once('close', (code, reason) => resolve({ ws, close: { code, reason: String(reason) } }));
    ws.once('unexpected-response', (_req, res) => resolve({ ws, statusCode: res.statusCode }));
    ws.once('error', (error) => resolve({ ws, error }));
  });
}

// Function รอให้ server ปิด WebSocket แล้วคืน close code และ reason
function waitForClose(ws: WebSocket): Promise<SocketClose> {
  return new Promise((resolve) => ws.once('close', (code, reason) => resolve({ code, reason: String(reason) })));
}

/* -------------------------------------- Tests -------------------------------------- */

test('client and admin payment sockets share one HTTP server without breaking each other', async (t) => {
  const port = await startSocketServer(t);
  stub(t, authService, {
    authenticateAccessToken: async (token) => {
      if (token !== 'good') throw new Error('invalid token');
      return { user: { id: 'u_1', permissions: ['transactions'] }, sessionId: 'sess_1' };
    },
  });

  const client = await connect(`ws://127.0.0.1:${port}/api/client/payments/ws?plateNo=ABC1234`);
  const admin = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&token=good`);
  t.after(() => [client.ws, admin.ws].forEach((ws) => ws.terminate()));
  assert.equal(client.message?.type, 'connected');
  assert.equal(admin.message?.type, 'connected');

  // connection ของ client ต้องยังรับ event ได้หลังมีการเปิด admin path บน server เดียวกัน
  const received = new Promise<SocketMessage>((resolve) => client.ws.once('message', (message) => resolve(JSON.parse(String(message)) as SocketMessage)));
  appEvents.emit('payment_updated', { type: 'payment_updated', chargeId: 'chrg_1', plateNo: 'ABC-1234', gatewayCharge: { chargeId: 'chrg_1' } });
  assert.equal((await received).chargeId, 'chrg_1');
});

test('admin payment socket closes with 4401/4403 and a reason when the handshake fails', async (t) => {
  const port = await startSocketServer(t);
  stub(t, authService, {
    authenticateAccessToken: async (token) => {
      if (token === 'no-permission') return { user: { id: 'u_2', permissions: ['dashboard'] }, sessionId: 'sess_2' };
      if (token === 'db-down') throw new Error('database unavailable');
      throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token');
    },
    getAccessTokenEndReason: async (token) => (token === 'logged-out' ? 'logout' : 'invalid_token'),
  });

  const anonymous = await connect(`ws://127.0.0.1:${port}/api/payments/ws`);
  const loggedOut = await connect(`ws://127.0.0.1:${port}/api/payments/ws?token=logged-out`);
  const forbidden = await connect(`ws://127.0.0.1:${port}/api/payments/ws?token=no-permission`);
  const dbDown = await connect(`ws://127.0.0.1:${port}/api/payments/ws?token=db-down`);
  const unknown = await connect(`ws://127.0.0.1:${port}/api/unknown/ws`);

  // browser เห็น close code ได้ (HTTP 401/403 ของ handshake เห็นเป็น 1006) ส่วน path ที่ไม่มีจริงยังตอบ 404
  assert.deepEqual(anonymous.close, { code: 4401, reason: 'invalid_token' });
  assert.deepEqual(loggedOut.close, { code: 4401, reason: 'logout' });
  assert.deepEqual(forbidden.close, { code: 4403, reason: 'forbidden' });
  assert.deepEqual(dbDown.close, { code: 1011, reason: 'internal_error' });
  assert.equal(unknown.statusCode, 404);
});

test('admin payment socket closes when its session is revoked but other sessions stay open', async (t) => {
  const port = await startSocketServer(t);
  stub(t, authService, {
    authenticateAccessToken: async (token) => ({ user: { id: 'u_1', permissions: ['transactions'] }, sessionId: String(token) }),
  });

  const revoked = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&token=sess_1`);
  const other = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&token=sess_2`);
  t.after(() => [revoked.ws, other.ws].forEach((ws) => ws.terminate()));
  assert.equal(revoked.message?.type, 'connected');

  const closed = waitForClose(revoked.ws);
  emitSessionRevoked({ sessionId: 'sess_1', reason: 'logout' });
  assert.deepEqual(await closed, { code: 4401, reason: 'logout' });
  assert.equal(other.ws.readyState, WebSocket.OPEN);
});

test('admin payment socket closes with 4403 when the transactions permission is removed', async (t) => {
  const port = await startSocketServer(t, { pingIntervalMs: 50 });
  let reason: string | null = null;
  stub(t, authService, {
    authenticateAccessToken: async () => ({ user: { id: 'u_1', permissions: ['transactions'] }, sessionId: 'sess_1' }),
    getSessionEndReasonById: async (_sessionId, _userId, options) => (options?.permission === 'transactions' ? reason : null),
  });

  const admin = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&token=good`);
  t.after(() => admin.ws.terminate());
  const closed = waitForClose(admin.ws);
  // ถอดสิทธิ์หลังเชื่อมต่อแล้ว รอบ ping ถัดไปต้องปิด connection
  reason = 'forbidden';
  assert.deepEqual(await closed, { code: 4403, reason: 'forbidden' });
});

test('admin payment socket accepts a ticket once and binds the connection to its chargeId', async (t) => {
  const port = await startSocketServer(t);
  let sessionReason: string | null = null;
  stub(t, authService, { getSessionEndReasonById: async () => sessionReason });
  const { ticket } = socketTicketService.issueSocketTicket({ userId: 'u_1', sessionId: 'sess_1', chargeId: 'chrg_1' });

  const admin = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&ticket=${ticket}`);
  const reused = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&ticket=${ticket}`);
  t.after(() => admin.ws.terminate());
  assert.equal(admin.message?.type, 'connected');
  assert.deepEqual(reused.close, { code: 4401, reason: 'invalid_token' });

  // subscribe ไป charge อื่นไม่ได้ เพราะ ticket ผูกกับ chrg_1
  const reply = new Promise<SocketMessage>((resolve) => admin.ws.once('message', (message) => resolve(JSON.parse(String(message)) as SocketMessage)));
  admin.ws.send(JSON.stringify({ type: 'subscribe', chargeId: 'chrg_2' }));
  assert.equal((await reply).type, 'error');

  // ticket ของ charge อื่น และ ticket ของ session ที่จบแล้ว
  const otherCharge = socketTicketService.issueSocketTicket({ userId: 'u_1', sessionId: 'sess_1', chargeId: 'chrg_2' });
  const mismatched = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&ticket=${otherCharge.ticket}`);
  sessionReason = 'logout';
  const ended = socketTicketService.issueSocketTicket({ userId: 'u_1', sessionId: 'sess_1', chargeId: 'chrg_1' });
  const loggedOut = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1&ticket=${ended.ticket}`);
  assert.deepEqual(mismatched.close, { code: 4401, reason: 'invalid_token' });
  assert.deepEqual(loggedOut.close, { code: 4401, reason: 'logout' });
});

test('admin payment socket checks Origin and accepts the access cookie from the Admin origin', async (t) => {
  const port = await startSocketServer(t);
  stub(t, authService, {
    authenticateAccessToken: async (token) => {
      if (token !== 'cookie-token') throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired token');
      return { user: { id: 'u_1', permissions: ['transactions'] }, sessionId: 'sess_1' };
    },
    getAccessTokenEndReason: async () => 'invalid_token',
  });
  const cookie = '__Host-cp_access=cookie-token';

  const admin = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1`, { headers: { Origin: 'http://localhost:3000', Cookie: cookie } });
  const otherSite = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1`, { headers: { Origin: 'https://evil.example', Cookie: cookie } });
  // cookie ใช้ได้เฉพาะเมื่อ Origin เป็นของ Admin ไม่มี Origin (client อื่น) ต้องใช้ Bearer
  const noOrigin = await connect(`ws://127.0.0.1:${port}/api/payments/ws?chargeId=chrg_1`, { headers: { Cookie: cookie } });
  t.after(() => admin.ws.terminate());

  assert.equal(admin.message?.type, 'connected');
  assert.deepEqual(otherSite.close, { code: 4403, reason: 'origin_not_allowed' });
  assert.deepEqual(noOrigin.close, { code: 4401, reason: 'invalid_token' });
});
