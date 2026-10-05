// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
// Import Test Helpers
import { fixture, stub } from '../support/mock';
// Import Middlewares
import { requireDeviceAuth } from '../../src/middlewares/device-auth.middleware';
// Import Services
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';
// Import Utils
import type { ApiError } from '../../src/utils/api-error';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function เรียก middleware ด้วย request จาก IP ที่กำหนด แล้วคืน error ที่ส่งให้ next (ผ่านคืน null)
function runDeviceAuth(ip: string): Promise<ApiError | null> {
  const headers: Record<string, string> = { 'x-device-id': 'K-1', 'x-device-token': 'token' };
  const req = fixture<Request>({ ip, body: {}, query: {}, params: {}, get: (name: string) => headers[name.toLowerCase()] });
  return new Promise((resolve) => {
    void requireDeviceAuth(['kiosk'])(req, fixture<Response>({}), (err?: unknown) => resolve((err as ApiError) || null));
  });
}

/* -------------------------------------- Tests -------------------------------------- */

test('a device with allowedIps can use its token only from those IPs', async (t) => {
  stub(t, deviceRegistryService, { verifyRegisteredDeviceToken: async () => ({ ok: true, device: { deviceId: 'K-1', deviceType: 'kiosk', allowedIps: ['10.0.0.5'] } }) });

  assert.equal(await runDeviceAuth('10.0.0.5'), null);
  // IPv4-mapped IPv6 ของ IP เดียวกันต้องผ่าน
  assert.equal(await runDeviceAuth('::ffff:10.0.0.5'), null);
  const blocked = await runDeviceAuth('203.0.113.9');
  assert.ok(blocked);
  assert.deepEqual([blocked.statusCode, blocked.code, blocked.details.reason], [403, 'INVALID_DEVICE_CREDENTIALS', 'ip_not_allowed']);
});

test('a device without allowedIps is not limited by IP', async (t) => {
  stub(t, deviceRegistryService, { verifyRegisteredDeviceToken: async () => ({ ok: true, device: { deviceId: 'K-1', deviceType: 'kiosk', allowedIps: [] } }) });

  assert.equal(await runDeviceAuth('203.0.113.9'), null);
});
