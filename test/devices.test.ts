// Import Library
import assert from 'node:assert/strict';
import { test } from 'node:test';
// Import Test Helpers
import { stub } from './support/mock';
import { mockSse } from './support/sse';
// Import Services
import * as devicesService from '../src/services/devices.service';
import * as deviceRegistryService from '../src/services/shared/device-registry.service';
// Import Realtime
import * as sse from '../src/realtime/sse';

/* -------------------------------------- Tests -------------------------------------- */

test('device SSE sends devices_snapshot and the ping interval when it connects', async (t) => {
  process.env.REALTIME_PING_INTERVAL_MS = '1000';
  t.mock.timers.enable({ apis: ['setInterval'] });
  stub(t, devicesService, { listDevices: async () => ({ total: 1, online: 1, offline: 0, maintenance: 0, devices: [{ deviceId: 'K-1' }], configUpdatedAt: 'rev' }) });

  const { req, res, events } = mockSse({ id: 'u_1' });
  t.after(() => req.emit('close'));
  await sse.openDeviceEventStream(req, res);

  assert.deepEqual(events.map((event) => event.type), ['connected', 'devices_snapshot']);
  assert.equal(events[0]?.pingIntervalMs, 1000);
  assert.deepEqual(events[1]?.data, { total: 1, online: 1, offline: 0, maintenance: 0, devices: [{ deviceId: 'K-1' }], configUpdatedAt: 'rev' });
});

test('device update returns INVALID_DEVICE_MAPPING with the field and invalid ids', async (t) => {
  stub(t, deviceRegistryService, {
    updateDevice: async () => ({ ok: false, reason: 'invalid_device_mapping', details: { field: 'cameraIds', invalidIds: ['CAM-404'] } }),
  });

  await assert.rejects(devicesService.updateDevice('GATE-1', { cameraIds: ['CAM-404'] }), {
    statusCode: 400,
    code: 'INVALID_DEVICE_MAPPING',
    details: { status: 'error', field: 'cameraIds', invalidIds: ['CAM-404'] },
  });
});

test('device update returns 409 CAMERA_IN_USE with the gate that already has the camera', async (t) => {
  const details = { field: 'cameraIds' as const, cameraIds: ['CAM-1'], assignedTo: [{ cameraId: 'CAM-1', deviceId: 'GATE-A' }] };
  stub(t, deviceRegistryService, { updateDevice: async () => ({ ok: false, reason: 'camera_in_use', details }) });

  await assert.rejects(devicesService.updateDevice('GATE-B', { cameraIds: ['CAM-1'] }), {
    statusCode: 409,
    code: 'CAMERA_IN_USE',
    details: { status: 'error', ...details },
  });
});

test('single device mapping routes return the device and map registry errors', async (t) => {
  const calls: unknown[] = [];
  stub(t, deviceRegistryService, {
    changeDeviceMapping: async (id, change) => {
      calls.push({ id, ...change });
      if (id === 'KIOSK-1') return { ok: false, reason: 'mapping_owner_invalid' };
      if (id === 'GATE-404') return null;
      return { ok: true, device: { id, deviceId: id, deviceName: 'Gate A', deviceType: 'barrier_gate', cameraIds: ['CAM-1'], printerIds: [], status: 'active', isOnline: true } };
    },
  });

  const mapped = await devicesService.changeDeviceMapping('GATE-A', 'cameraIds', 'CAM-1', 'add');
  assert.equal(mapped.message, 'Device mapped');
  assert.deepEqual(mapped.device.cameraIds, ['CAM-1']);
  assert.equal((await devicesService.changeDeviceMapping('GATE-A', 'cameraIds', 'CAM-1', 'remove')).message, 'Device unmapped');
  await assert.rejects(devicesService.changeDeviceMapping('KIOSK-1', 'cameraIds', 'CAM-1', 'add'), { statusCode: 400, code: 'DEVICE_MAPPING_NOT_SUPPORTED' });
  await assert.rejects(devicesService.changeDeviceMapping('GATE-404', 'printerIds', 'PRN-1', 'add'), { statusCode: 404, code: 'DEVICE_NOT_FOUND' });
  assert.deepEqual(calls[1], { id: 'GATE-A', field: 'cameraIds', deviceId: 'CAM-1', action: 'remove' });
});
