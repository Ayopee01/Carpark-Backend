// Import Library
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
// Import Test Helpers
import { stubRegisteredDevices } from '../../support/device';
import { setEnv, stub } from '../../support/mock';
// Import Services
import * as authService from '../../../src/services/auth.service';
import * as clientService from '../../../src/services/client.service';
import * as dashboardService from '../../../src/services/dashboard.service';
import * as devicesService from '../../../src/services/devices.service';
import * as deviceRegistryService from '../../../src/services/shared/device-registry.service';
import * as paymentRealtimeService from '../../../src/services/shared/payment-realtime.service';
// Import WebSockets
import { createQueuedTask } from '../../../src/websockets/admin.socket';
import { setupWebSocket } from '../../../src/websockets/websocket';
// Import Utils
import { ApiError } from '../../../src/utils/api-error';
import { appEvents, emitDashboardUpdated, emitSessionRevoked } from '../../../src/utils/events';

/* -------------------------------------- Types -------------------------------------- */

// Type ผลของ ack ที่ server ตอบ
interface AckResponse {
  ok: boolean;
  data?: unknown;
  error?: { code: string | null; message: string };
}

// Type ข้อมูลของ connect_error ที่ server ส่งมา
interface ConnectErrorData {
  statusCode: number;
  code: string | null;
  reason?: string;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function เปิด HTTP server พร้อม Socket.IO แล้วคืน URL (ปิดทั้งหมดตอนจบ test) ping ถี่เพื่อให้รอบตรวจ session/อุปกรณ์เกิดเร็ว
async function startRealtime(t: TestContext, { pingIntervalMs = 60000 }: { pingIntervalMs?: number } = {}): Promise<string> {
  setEnv(t, { REALTIME_PING_INTERVAL_MS: String(pingIntervalMs) });
  const server = http.createServer();
  const webSocket = setupWebSocket(server, { getIp: (request) => request.socket.remoteAddress });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => {
    webSocket.close();
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// Function ต่อ namespace แล้วรอผล connect (คืน socket) หรือ connect_error (คืน error data) ไม่ reconnect เองเพื่อให้ test ควบคุมได้
function connect(t: TestContext, url: string, options: Partial<ManagerOptions & SocketOptions> = {}): Promise<{ socket: Socket; error?: ConnectErrorData }> {
  const socket = io(url, { transports: ['websocket'], reconnection: false, forceNew: true, ...options });
  t.after(() => socket.close());
  return new Promise((resolve) => {
    socket.once('connect', () => resolve({ socket }));
    socket.once('connect_error', (err) => resolve({ socket, error: (err as Error & { data?: ConnectErrorData }).data }));
  });
}

// Function รอ event ถัดไปของ socket
function waitFor<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Function stub การยืนยันตัวตน Admin: token "good" = u_1/sess_1, "other" = u_2/sess_2 ค่าอื่นคือ invalid_token (logged-out = session จบแล้ว)
function stubAdminAuth(t: TestContext, permissions: string[] = ['transactions']): void {
  stub(t, authService, {
    authenticateAccessToken: async (token) => {
      if (token === 'good') return { user: { id: 'u_1', permissions }, sessionId: 'sess_1' };
      if (token === 'other') return { user: { id: 'u_2', permissions }, sessionId: 'sess_2' };
      throw new ApiError(401, 'INVALID_SESSION', 'Invalid or expired session');
    },
    getAccessTokenEndReason: async (token) => (token === 'logged-out' ? 'logout' : 'invalid_token'),
    getSessionState: async () => ({ reason: null, permissions }),
  });
}

/* -------------------------------------- Admin Tests -------------------------------------- */

test('admin namespace rejects the handshake with UNAUTHORIZED and the reason to refresh or log in again', async (t) => {
  const url = await startRealtime(t);
  stubAdminAuth(t);

  const invalid = await connect(t, `${url}/admin`, { auth: { token: 'expired' } });
  assert.deepEqual([invalid.error?.statusCode, invalid.error?.reason], [401, 'invalid_token']);
  const loggedOut = await connect(t, `${url}/admin`, { auth: { token: 'logged-out' } });
  assert.deepEqual([loggedOut.error?.statusCode, loggedOut.error?.reason], [401, 'logout']);
  assert.equal((await connect(t, `${url}/admin`, { auth: { token: 'good' } })).error, undefined);
});

test('admin payments follow chargeId or plateNo and the subscribe ack returns the current status', async (t) => {
  const url = await startRealtime(t);
  stubAdminAuth(t);
  stub(t, paymentRealtimeService, { buildPaymentUpdateSnapshot: async (chargeId) => ({ type: 'payment_updated', chargeId, paymentStatus: 'successful', replayed: true }) });

  const byCharge = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
  const byPlate = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
  const ack = await byCharge.socket.emitWithAck('payments:subscribe', { chargeId: 'chrg_1' }) as AckResponse;
  assert.deepEqual(ack, { ok: true, data: { type: 'payment_updated', chargeId: 'chrg_1', paymentStatus: 'successful', replayed: true } });
  assert.deepEqual(await byPlate.socket.emitWithAck('payments:subscribe', { plateNo: 'ABC 1234' }), { ok: true, data: null });

  const chargeUpdate = waitFor(byCharge.socket, 'payments:updated');
  const plateUpdate = waitFor(byPlate.socket, 'payments:updated');
  appEvents.emit('payment_updated', { type: 'payment_updated', chargeId: 'chrg_1', plateNo: 'ABC-1234' });
  assert.equal((await chargeUpdate as { chargeId: string }).chargeId, 'chrg_1');
  assert.equal((await plateUpdate as { chargeId: string }).chargeId, 'chrg_1');

  // ไม่ส่ง chargeId และ plateNo ได้ VALIDATION_ERROR เหมือน HTTP
  assert.equal((await byCharge.socket.emitWithAck('payments:subscribe', {}) as AckResponse).error?.code, 'VALIDATION_ERROR');
});

test('admin streams need their permission and answer FORBIDDEN without it', async (t) => {
  const url = await startRealtime(t);
  stubAdminAuth(t, ['dashboard']);

  const { socket } = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
  assert.deepEqual((await socket.emitWithAck('payments:subscribe', { chargeId: 'chrg_1' }) as AckResponse).error?.code, 'FORBIDDEN');
  assert.deepEqual((await socket.emitWithAck('devices:subscribe') as AckResponse).error?.code, 'FORBIDDEN');
});

test('admin socket gets session:revoked and is disconnected only for the matching session or user', async (t) => {
  const url = await startRealtime(t);
  stubAdminAuth(t);

  const revoked = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
  const other = await connect(t, `${url}/admin`, { auth: { token: 'other' } });
  const event = waitFor<{ reason: string }>(revoked.socket, 'session:revoked');
  const disconnected = waitFor(revoked.socket, 'disconnect');
  emitSessionRevoked({ sessionId: 'sess_1', reason: 'logout' });

  assert.equal((await event).reason, 'logout');
  assert.equal(await disconnected, 'io server disconnect');
  assert.equal(other.socket.connected, true);

  // ระงับ user (ไม่ระบุ sessionId) ตัดทุก session ของ user
  const userDisconnected = waitFor(other.socket, 'disconnect');
  emitSessionRevoked({ userId: 'u_2', reason: 'user_disabled' });
  assert.equal(await userDisconnected, 'io server disconnect');
});

test('admin socket stops a stream whose permission was removed and disconnects when the session ends', async (t) => {
  const url = await startRealtime(t, { pingIntervalMs: 50 });
  let state: { reason: string | null; permissions: string[] } = { reason: null, permissions: ['transactions'] };
  stubAdminAuth(t);
  stub(t, authService, { getSessionState: async () => state });
  stub(t, paymentRealtimeService, { buildPaymentUpdateSnapshot: async () => null });

  const { socket } = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
  await socket.emitWithAck('payments:subscribe', { chargeId: 'chrg_1' });
  const forbidden = waitFor<{ stream: string }>(socket, 'stream:forbidden');
  // ถอดสิทธิ์หลังเชื่อมต่อแล้ว รอบตรวจถัดไปต้องเลิกส่ง payments
  state = { reason: null, permissions: [] };
  assert.deepEqual(await forbidden, { stream: 'payments' });

  const revoked = waitFor<{ reason: string }>(socket, 'session:revoked');
  state = { reason: 'session_expired', permissions: [] };
  assert.equal((await revoked).reason, 'session_expired');
});

test('dashboard stream sends data only with dashboard permission and refunds/alerts only with transactions permission', async (t) => {
  const url = await startRealtime(t);
  const refunds = { pendingCount: 1, pendingAmount: 4000, pending: [{ chargeId: 'chrg_1' }] };
  stub(t, dashboardService, {
    getDashboardSummary: async ({ includeRefunds }) => ({ summaryCards: { totalTickets: 1 }, refunds: includeRefunds ? refunds : null }),
    getDashboardRefunds: async () => ({ refunds }),
  });

  // เปิด socket ของผู้ใช้ที่มีสิทธิ์ต่างกัน
  const open = async (permissions: string[]) => {
    stubAdminAuth(t, permissions);
    const { socket } = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
    const events: string[] = [];
    socket.onAny((event) => events.push(event));
    return { socket, events, snapshot: (await socket.emitWithAck('dashboard:subscribe') as AckResponse).data };
  };
  const dashboardOnly = await open(['dashboard']);
  const transactionsOnly = await open(['transactions']);
  const both = await open(['dashboard', 'transactions']);

  assert.deepEqual(dashboardOnly.snapshot, { summaryCards: { totalTickets: 1 }, refunds: null });
  assert.deepEqual(transactionsOnly.snapshot, { refunds });
  assert.deepEqual(both.snapshot, { summaryCards: { totalTickets: 1 }, refunds });

  // รอทุก socket ก่อนส่ง event เพื่อไม่พลาด event ที่มาถึงก่อนเริ่มรอ
  const updates = [dashboardOnly, transactionsOnly, both].map(({ socket }) => waitFor<{ trigger: { reason: string } }>(socket, 'dashboard:updated'));
  appEvents.emit('refund_event', { type: 'refund_required', chargeId: 'chrg_2' });
  appEvents.emit('device_alert', { type: 'device_ip_blocked', deviceId: 'K-1' });
  emitDashboardUpdated('payment_received', { id: 't_1', plateNo: 'ABC1234' });
  assert.deepEqual((await Promise.all(updates)).map((update) => update.trigger.reason), ['payment_received', 'payment_received', 'payment_received']);

  assert.deepEqual(dashboardOnly.events, ['dashboard:updated']);
  assert.deepEqual(both.events, ['refunds:event', 'device_alerts:event', 'dashboard:updated']);
});

test('dashboard stream sends the new day summary on the first check after Bangkok midnight', async (t) => {
  // เริ่ม 23:59:59 เวลาไทย แล้วเดินเวลาข้ามเที่ยงคืน
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-30T16:59:59.500Z') });
  const url = await startRealtime(t, { pingIntervalMs: 50 });
  stubAdminAuth(t, ['dashboard']);
  stub(t, dashboardService, { getDashboardSummary: async () => ({ ok: true }) });

  const { socket } = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
  await socket.emitWithAck('dashboard:subscribe');
  const updated = waitFor<{ trigger: { reason: string } }>(socket, 'dashboard:updated');
  t.mock.timers.setTime(new Date('2026-09-30T17:00:01.000Z').getTime());
  assert.equal((await updated).trigger.reason, 'day_changed');
});

test('devices stream answers the snapshot and forwards device events and config changes', async (t) => {
  const url = await startRealtime(t);
  stubAdminAuth(t, ['devices']);
  const snapshot = { total: 1, online: 1, offline: 0, maintenance: 0, devices: [{ deviceId: 'K-1' }], configUpdatedAt: 'rev' };
  stub(t, devicesService, { listDevices: async () => snapshot });

  const { socket } = await connect(t, `${url}/admin`, { auth: { token: 'good' } });
  assert.deepEqual(await socket.emitWithAck('devices:subscribe'), { ok: true, data: snapshot });

  const event = waitFor(socket, 'devices:event');
  const config = waitFor(socket, 'devices:config_updated');
  appEvents.emit('device_event', { type: 'device_online', deviceId: 'K-1' });
  appEvents.emit('devices_config_updated', { total: 1 });
  assert.deepEqual(await event, { type: 'device_online', deviceId: 'K-1' });
  assert.deepEqual(await config, { config: { total: 1 } });
});

/* -------------------------------------- Client Tests -------------------------------------- */

// Function stub อุปกรณ์ K-1 (kiosk) ที่ token "valid" ใช้ได้ และผลตรวจซ้ำตามที่กำหนด
function stubKiosk(t: TestContext, recheck: { ok: true } | { ok: false; reason: string } = { ok: true }): void {
  stubRegisteredDevices(t, { 'K-1': {} });
  stub(t, deviceRegistryService, { updateRegisteredDeviceHeartbeat: async () => null });
  stub(t, clientService, { refreshDeviceHeartbeat: async () => recheck });
}

test('client namespace accepts mobile without auth and kiosks with valid device credentials only', async (t) => {
  const url = await startRealtime(t);
  stubKiosk(t);

  const mobile = await connect(t, `${url}/client`);
  assert.equal(mobile.error, undefined);
  const kiosk = await connect(t, `${url}/client`, { auth: { deviceId: 'K-1', deviceToken: 'valid' } });
  assert.equal(kiosk.error, undefined);
  const wrongToken = await connect(t, `${url}/client`, { auth: { deviceId: 'K-1', deviceToken: 'wrong' } });
  assert.deepEqual([wrongToken.error?.code, wrongToken.error?.reason], ['INVALID_DEVICE_CREDENTIALS', 'invalid_token']);
});

test('client payments follow chargeId only so a plate number cannot be followed without device credentials', async (t) => {
  const url = await startRealtime(t);
  stub(t, paymentRealtimeService, { buildPaymentUpdateSnapshot: async () => null });

  const { socket } = await connect(t, `${url}/client`);
  assert.equal((await socket.emitWithAck('payments:subscribe', { plateNo: 'ABC1234' }) as AckResponse).error?.code, 'VALIDATION_ERROR');
  assert.deepEqual(await socket.emitWithAck('payments:subscribe', { chargeId: 'chrg_1' }), { ok: true, data: null });

  const updated = waitFor(socket, 'payments:updated');
  appEvents.emit('payment_updated', { type: 'payment_updated', chargeId: 'chrg_1', plateNo: 'ABC1234' });
  assert.equal((await updated as { chargeId: string }).chargeId, 'chrg_1');
});

test('client namespace sends lpr:detected only to devices whose filters match', async (t) => {
  const url = await startRealtime(t);
  stubKiosk(t);

  const gateA = await connect(t, `${url}/client`, { auth: { deviceId: 'K-1', deviceToken: 'valid', gateId: 'GATE-A', direction: 'out' } });
  const gateB = await connect(t, `${url}/client`, { auth: { deviceId: 'K-1', deviceToken: 'valid', gateId: 'GATE-B' } });
  const received: string[] = [];
  gateB.socket.on('lpr:detected', () => received.push('B'));
  const detected = waitFor<{ gateId: string }>(gateA.socket, 'lpr:detected');
  appEvents.emit('lpr_detected', { gateId: 'GATE-A', direction: 'OUT', cameraId: 'CAM-1' });

  assert.equal((await detected).gateId, 'GATE-A');
  assert.deepEqual(received, []);
});

test('client device is disconnected with device:revoked when its token no longer works', async (t) => {
  const url = await startRealtime(t, { pingIntervalMs: 50 });
  stubKiosk(t, { ok: false, reason: 'invalid_token' });

  const { socket } = await connect(t, `${url}/client`, { auth: { deviceId: 'K-1', deviceToken: 'valid' } });
  const revoked = waitFor<{ reason: string }>(socket, 'device:revoked');
  const disconnected = waitFor(socket, 'disconnect');
  assert.equal((await revoked).reason, 'invalid_token');
  assert.equal(await disconnected, 'io server disconnect');
});

test('client device is disconnected without device:revoked when it becomes inactive or its IP is not allowed', async (t) => {
  for (const reason of ['inactive', 'ip_not_allowed']) {
    await t.test(reason, async (st) => {
      const url = await startRealtime(st, { pingIntervalMs: 50 });
      stubKiosk(st, { ok: false, reason });

      const { socket } = await connect(st, `${url}/client`, { auth: { deviceId: 'K-1', deviceToken: 'valid' } });
      const events: string[] = [];
      socket.onAny((event) => events.push(event));
      // ตู้ต่อใหม่แล้วได้ connect_error reason เดียวกัน จึงไปหน้า Maintenance และเก็บ token ไว้
      assert.equal(await waitFor(socket, 'disconnect'), 'io server disconnect');
      assert.equal(events.includes('device:revoked'), false);
    });
  }
});

test('client device stays connected while its token and IP are valid', async (t) => {
  const url = await startRealtime(t, { pingIntervalMs: 50 });
  stubKiosk(t, { ok: true });

  const { socket } = await connect(t, `${url}/client`, { auth: { deviceId: 'K-1', deviceToken: 'valid' } });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(socket.connected, true);
});

/* -------------------------------------- Helper Tests -------------------------------------- */

test('createQueuedTask reruns once with latest args when called during a run', async () => {
  const calls: string[] = [];
  let release: () => void = () => {};
  const task = createQueuedTask(async (value: string) => {
    calls.push(value);
    if (value === 'first') await new Promise<void>((resolve) => { release = resolve; });
  });

  // เรียกซ้อนระหว่างงานแรกยังไม่เสร็จ ต้องไม่หาย และรันเฉพาะค่าล่าสุด
  const first = task('first');
  void task('second');
  void task('third');
  release();
  await first;

  assert.deepEqual(calls, ['first', 'third']);
});
