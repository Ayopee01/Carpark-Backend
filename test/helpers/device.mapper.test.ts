// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture } from '../support/mock';
// Import Mappers
import { toDeviceApi } from '../../src/repositories/mappers/device.mapper';
// Import Types
import type { SafeDevice } from '../../src/types/shared/device.type';

/* -------------------------------------- Tests -------------------------------------- */

test('maps a camera without mapping fields and an EDC without network fields', () => {
  const camera = toDeviceApi(fixture<SafeDevice>({ id: 'CAM-1', deviceId: 'CAM-1', deviceCode: 'CAM-1', deviceName: 'Camera', deviceType: 'camera', status: 'active', isOnline: true, cameraIds: [], cameraRole: 'lpr', direction: 'out', deviceTokenIssuedAt: '2026-10-01T00:00:00.000Z' }));
  const edc = toDeviceApi(fixture<SafeDevice>({ id: 'EDC-1', deviceId: 'EDC-1', deviceCode: 'EDC-1', deviceName: 'EDC', deviceType: 'edc', terminalId: 'TID-1', usage: 'device', status: 'active', isOnline: true, gateId: 'G1' }));

  assert.deepEqual(Object.keys(camera).sort(), ['activatedAt', 'allowedIps', 'cameraRole', 'connectionType', 'deviceCode', 'deviceId', 'deviceName', 'deviceType', 'direction', 'gateId', 'id', 'ipAddress', 'isOnline', 'lastSeen', 'location', 'note', 'printerRole', 'status']);
  // direction ที่ไม่ใช่ IN/OUT ตัวพิมพ์ใหญ่ถือว่าไม่ได้กำหนด
  assert.equal(camera.deviceType === 'camera' && camera.direction, null);
  assert.deepEqual(Object.keys(edc).sort(), ['deviceCode', 'deviceId', 'deviceName', 'deviceType', 'id', 'isOnline', 'location', 'merchantId', 'note', 'provider', 'serialNo', 'status', 'terminalId', 'usage']);
  // เครื่อง EDC ไม่มี heartbeat จึงไม่ online
  assert.equal(edc.isOnline, false);
});
