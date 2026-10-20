// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
// Import Test Helpers
import { fixture, setEnv, stub } from '../support/mock';
// Import Middlewares
import { requireDeviceAuth } from '../../src/middlewares/device-auth.middleware';
// Import Services
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';
// Import Utils
import type { ApiError } from '../../src/utils/api-error';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Type request ของ device auth ที่ test กำหนดได้
interface DeviceAuthRequest {
  ip: string;
  deviceId?: string;
  token?: string;
  query?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

// Function เรียก middleware ด้วย request ที่กำหนด แล้วคืน error ที่ส่งให้ next (ผ่านคืน null)
function runDeviceAuth({ ip, deviceId = 'K-1', token = 'token', query = {}, responseHeaders = {} }: DeviceAuthRequest): Promise<ApiError | null> {
  const headers: Record<string, string> = { 'x-device-id': deviceId, 'x-device-token': token };
  const req = fixture<Request>({ ip, body: {}, query, params: {}, get: (name: string) => headers[name.toLowerCase()] });
  const res = fixture<Response>({ setHeader: (name: string, value: string) => { responseHeaders[name] = value; } });
  return new Promise((resolve) => {
    void requireDeviceAuth(['kiosk'])(req, res, (err?: unknown) => resolve((err as ApiError) || null));
  });
}

// Function ทำให้ verifyRegisteredDeviceToken ผ่านเฉพาะ token "valid" ของ deviceId นั้น (token อื่นคือ invalid_token)
function stubKioskTokens(t: test.TestContext, devices: Record<string, { status?: string; allowedIps?: string[] }>): void {
  stub(t, deviceRegistryService, {
    verifyRegisteredDeviceToken: async (deviceId, token) => {
      const device = devices[deviceId ?? ''];
      if (!device) return { ok: false, reason: 'not_found' };
      if (device.status === 'inactive') return { ok: false, reason: 'inactive' };
      return token === 'valid' ? { ok: true, device: { deviceId, deviceType: 'kiosk', allowedIps: device.allowedIps ?? [] } } : { ok: false, reason: 'invalid_token' };
    },
    reportDeviceIpBlocked: () => undefined,
  });
}

/* -------------------------------------- Tests -------------------------------------- */

test('a device with allowedIps can use its token only from those IPs or CIDR ranges', async (t) => {
  const blockedReports: string[] = [];
  stubKioskTokens(t, { 'K-1': { allowedIps: ['10.0.0.5', '203.0.113.0/28'] } });
  stub(t, deviceRegistryService, { reportDeviceIpBlocked: (_device, ip) => blockedReports.push(String(ip)) });

  assert.equal(await runDeviceAuth({ ip: '10.0.0.5', token: 'valid' }), null);
  // IPv4-mapped IPv6 ของ IP เดียวกันต้องผ่าน
  assert.equal(await runDeviceAuth({ ip: '::ffff:10.0.0.5', token: 'valid' }), null);
  assert.equal(await runDeviceAuth({ ip: '203.0.113.14', token: 'valid' }), null);
  const blocked = await runDeviceAuth({ ip: '203.0.113.16', token: 'valid' });
  assert.deepEqual([blocked?.statusCode, blocked?.code, blocked?.details.reason], [403, 'INVALID_DEVICE_CREDENTIALS', 'ip_not_allowed']);
  // แจ้งเตือน Admin ให้แก้ allowedIps
  assert.deepEqual(blockedReports, ['203.0.113.16']);
});

test('a device without allowedIps is not limited by IP', async (t) => {
  stubKioskTokens(t, { 'K-1': {} });

  assert.equal(await runDeviceAuth({ ip: '203.0.113.9', token: 'valid' }), null);
});

test('REQUIRE_DEVICE_ALLOWED_IPS blocks kiosk/barrier gate without allowedIps only', async (t) => {
  setEnv(t, { REQUIRE_DEVICE_ALLOWED_IPS: 'true' });
  let device = { deviceId: 'K-1', deviceType: 'kiosk', allowedIps: [] as string[] };
  stub(t, deviceRegistryService, { verifyRegisteredDeviceToken: async () => ({ ok: true, device }), reportDeviceIpBlocked: () => undefined });

  const blocked = await runDeviceAuth({ ip: '203.0.113.10' });
  assert.deepEqual([blocked?.statusCode, blocked?.code, blocked?.details.reason], [403, 'INVALID_DEVICE_CREDENTIALS', 'ip_not_allowed']);
  // กล้องไม่บังคับ allowedIps
  device = { deviceId: 'K-1', deviceType: 'camera', allowedIps: [] };
  assert.equal(await runDeviceAuth({ ip: '203.0.113.10' }), null);
});

test('30 wrong tokens for one device from one IP pause that device with Retry-After', async (t) => {
  stubKioskTokens(t, { 'K-1': {}, 'K-2': {} });
  const ip = '198.51.100.77';

  // test.env ตั้ง DEVICE_AUTH_RATE_LIMIT=30
  for (let i = 0; i < 30; i += 1) assert.equal((await runDeviceAuth({ ip }))?.code, 'INVALID_DEVICE_CREDENTIALS');
  const responseHeaders: Record<string, string> = {};
  const blocked = await runDeviceAuth({ ip, responseHeaders });
  assert.deepEqual([blocked?.statusCode, blocked?.code], [429, 'TOO_MANY_DEVICE_AUTH_ATTEMPTS']);
  const retryAfter = Number(responseHeaders['Retry-After']);
  assert.ok(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 15 * 60);

  // ตู้อื่นหลัง NAT เดียวกันที่ token ถูกต้องยังใช้งานได้
  assert.equal(await runDeviceAuth({ ip, deviceId: 'K-2', token: 'valid' }), null);
  // IP อื่นของเครื่องเดิมไม่โดนพักไปด้วย
  assert.equal((await runDeviceAuth({ ip: '198.51.100.78' }))?.code, 'INVALID_DEVICE_CREDENTIALS');
});

test('guessing across many deviceIds from one IP pauses the whole IP', async (t) => {
  stubKioskTokens(t, { 'K-1': {} });
  const ip = '198.51.100.80';

  // เพดานต่อ IP = DEVICE_AUTH_RATE_LIMIT x 10 = 300 (ไล่ deviceId ใหม่ทุกครั้งจึงไม่ติดตัวนับต่อเครื่อง)
  for (let i = 0; i < 300; i += 1) assert.equal((await runDeviceAuth({ ip, deviceId: `X-${i}` }))?.code, 'INVALID_DEVICE_CREDENTIALS');
  assert.equal((await runDeviceAuth({ ip, deviceId: 'X-new' }))?.code, 'TOO_MANY_DEVICE_AUTH_ATTEMPTS');
  assert.equal((await runDeviceAuth({ ip, token: 'valid' }))?.code, 'TOO_MANY_DEVICE_AUTH_ATTEMPTS');
});

test('an inactive kiosk heartbeat is not counted and does not pause kiosks on the same IP', async (t) => {
  stubKioskTokens(t, { 'K-OFF': { status: 'inactive' }, 'K-1': {} });
  const ip = '198.51.100.85';

  for (let i = 0; i < 40; i += 1) {
    const error = await runDeviceAuth({ ip, deviceId: 'K-OFF', token: 'valid' });
    assert.deepEqual([error?.statusCode, error?.details.reason], [403, 'inactive']);
  }
  assert.equal(await runDeviceAuth({ ip, token: 'valid' }), null);
});

test('ip_not_allowed does not count as a failed token check', async (t) => {
  stubKioskTokens(t, { 'K-1': { allowedIps: ['10.0.0.5'] } });
  const ip = '198.51.100.90';

  for (let i = 0; i < 31; i += 1) assert.equal((await runDeviceAuth({ ip, token: 'valid' }))?.details.reason, 'ip_not_allowed');
});

test('SSE deviceId in query must match the x-device-id header', async (t) => {
  stubKioskTokens(t, { 'K-1': {} });

  // frontend เวอร์ชันเก่าส่ง deviceId ใน query ค่าเดียวกับ header ต้องยังผ่าน
  assert.equal(await runDeviceAuth({ ip: '10.0.0.9', token: 'valid', query: { deviceId: 'K-1' } }), null);
  const mismatch = await runDeviceAuth({ ip: '10.0.0.9', token: 'valid', query: { deviceId: 'K-2' } });
  assert.deepEqual([mismatch?.statusCode, mismatch?.code], [400, 'DEVICE_IDENTITY_MISMATCH']);
});
