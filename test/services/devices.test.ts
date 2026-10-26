// Import Library
import assert from 'node:assert/strict';
import { test } from 'node:test';
// Import Test Helpers
import { stub } from '../support/mock';
// Import Services
import * as devicesService from '../../src/services/devices.service';
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';

/* -------------------------------------- Tests -------------------------------------- */

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

test('device list returns every key of the device type even when the stored record does not have it', async (t) => {
  stub(t, deviceRegistryService, { getDevicesConfigWithMeta: async () => ({
    summary: { totalDevices: 2, online: 0, offline: 2 },
    configUpdatedAt: 'rev',
    devices: [
      { id: 'K-1', deviceId: null, deviceCode: 'K-1', deviceName: 'Kiosk 1', deviceType: 'kiosk', status: 'pending_activation', isOnline: false, deviceTokenHash: 'hash' },
      { id: 'EDC-1', deviceId: 'EDC-1', deviceCode: 'EDC-1', deviceName: 'EDC 1', deviceType: 'edc', terminalId: 'TID-1', usage: 'cashier', status: 'active', isOnline: false },
    ],
  }) });

  const result = await devicesService.listDevices({ keyword: 'kiosk' });

  assert.equal(result.total, 1);
  assert.deepEqual(result.devices[0], {
    id: 'K-1', deviceId: null, deviceCode: 'K-1', deviceName: 'Kiosk 1', deviceType: 'kiosk', location: null, status: 'pending_activation', isOnline: false, note: null,
    connectionType: null, ipAddress: null, lastSeen: null, activatedAt: null, allowedIps: [], gateId: null, direction: null, cameraRole: null, printerRole: null,
    activationCode: null, activationExpiresAt: null, cameraIds: [], printerIds: [], edcDeviceId: null,
  });
});

test('creating a kiosk returns its real pending status and the device', async (t) => {
  stub(t, deviceRegistryService, { createActivationDevice: async (payload) => ({
    ok: true,
    activationCode: '123456',
    activationExpiresAt: '2026-10-08T10:10:00.000Z',
    device: { id: 'K-1', deviceId: null, deviceCode: 'K-1', deviceName: payload?.deviceName ?? '', deviceType: 'kiosk', status: 'pending_activation', isOnline: false },
  }) });

  const result = await devicesService.createDevice({ deviceType: 'kiosk', deviceName: 'Kiosk 1' });

  assert.ok('CodeActivate' in result);
  assert.deepEqual([result.CodeActivate, result.status, result.isOnline, result.device.id, result.device.deviceId], ['123456', 'pending_activation', false, 'K-1', null]);
});
