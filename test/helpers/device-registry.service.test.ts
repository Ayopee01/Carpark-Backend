// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture as asFixture, replace } from '../support/mock';
// Import Repositories
import * as configRepository from '../../src/repositories/config.repository';
// Import Services
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';
// Import Types
import type { DeviceRecord, DevicesConfig } from '../../src/types/shared/device.type';
// Import Utils
import { hashToken } from '../../src/utils/crypto';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function แทน config repository ด้วย devices config ใน memory แล้วคืน function อ่านค่าและคืนค่าเดิม
function mockDevicesConfig(initialConfig: { devices: object[] } = { devices: [] }): { getConfig: () => DevicesConfig; restore: () => void } {
  let config = asFixture<DevicesConfig>(structuredClone(initialConfig));
  const withMeta = () => ({ ...structuredClone(config), configUpdatedAt: 'test-updated-at' });

  const restore = replace(configRepository, {
    getConfig: async () => structuredClone(config),
    getConfigWithMeta: async () => withMeta(),
    setConfig: async (_key, value) => {
      config = asFixture<DevicesConfig>(structuredClone(value));
      return withMeta();
    },
    updateConfig: async (key, updater) => {
      const next = await updater(asFixture(structuredClone(config)), { key, data: asFixture(config), updatedAt: new Date('2026-06-26T00:00:00Z') });
      if (next !== undefined) config = asFixture<DevicesConfig>(structuredClone(next));
      return withMeta();
    },
  });

  return { getConfig: () => structuredClone(config), restore };
}

// Function อ่าน field ที่ถูกตัดออกจาก SafeDevice เพื่อยืนยันว่าไม่ส่ง token hash ออกไป
function tokenHashOf(device: object): unknown {
  return (device as DeviceRecord).deviceTokenHash;
}

// Function หาอุปกรณ์ใน config ตาม id (ต้องมีอยู่)
function deviceById(config: DevicesConfig, id: string): DeviceRecord {
  const device = config.devices.find((item) => item.id === id);
  assert.ok(device, `device ${id} not found`);
  return device;
}

/* -------------------------------------- Tests -------------------------------------- */

test('provisions a credentialed camera with a one-time device token', async (t) => {
  const fixture = mockDevicesConfig();
  t.after(fixture.restore);

  const result = await deviceRegistryService.provisionCredentialedDevice('camera', {
    deviceName: 'Camera OUT A',
    deviceCode: 'CAM-OUT-A',
    gateId: 'GATE-A',
    direction: 'OUT',
  });

  assert.ok(result.ok);
  assert.equal(result.device.deviceId, 'CAM-OUT-A');
  assert.equal(result.device.cameraRole, 'lpr');
  assert.equal(tokenHashOf(result.device), undefined);
  assert.equal(typeof deviceById(fixture.getConfig(), 'CAM-OUT-A').deviceTokenHash, 'string');

  const verified = await deviceRegistryService.verifyRegisteredDeviceToken('CAM-OUT-A', result.deviceToken, ['camera']);
  assert.ok(verified.ok);
  assert.equal(tokenHashOf(verified.device), undefined);
});

test('rejects duplicate provisioned device ids', async (t) => {
  const fixture = mockDevicesConfig({ devices: [{ id: 'PRN-GATE-A', deviceId: 'PRN-GATE-A', deviceCode: 'PRN-GATE-A', deviceType: 'printer', status: 'active' }] });
  t.after(fixture.restore);

  const result = await deviceRegistryService.provisionCredentialedDevice('printer', { deviceName: 'Printer', deviceCode: 'PRN-GATE-A' });

  assert.deepEqual(result, { ok: false, reason: 'duplicate' });
});

test('activates a pending kiosk once with its activation code', async (t) => {
  const fixture = mockDevicesConfig({ devices: [{ id: 'PRN-1', deviceId: 'PRN-1', deviceType: 'printer', deviceCode: 'PRN-1', status: 'active' }] });
  t.after(fixture.restore);

  const created = await deviceRegistryService.createActivationDevice({ deviceName: 'Kiosk A', deviceType: 'kiosk', printerIds: ['PRN-1', 'PRN-1'] });
  assert.ok(created.ok);
  assert.equal(created.device.status, 'pending_activation');
  assert.match(created.activationCode, /^\d{6}$/);

  const activated = await deviceRegistryService.activateDeviceByCode(created.activationCode);
  assert.ok(activated);
  assert.equal(activated.device.deviceId, created.device.id);
  assert.equal(activated.device.status, 'active');
  assert.deepEqual(activated.device.printerIds, ['PRN-1']);
  assert.ok(activated.deviceToken.length > 20);

  // code ใช้ได้ครั้งเดียว
  assert.equal(await deviceRegistryService.activateDeviceByCode(created.activationCode), null);
});

test('reissues activation code for a barrier gate without losing mappings', async (t) => {
  const fixture = mockDevicesConfig({
    devices: [{
      id: 'BG-OUT-A',
      deviceId: 'BG-OUT-A',
      deviceCode: 'BG-OUT-A',
      deviceType: 'barrier_gate',
      status: 'active',
      isOnline: true,
      gateId: 'GATE-A',
      direction: 'OUT',
      cameraIds: ['CAM-OUT-A'],
      printerIds: ['PRN-GATE-A'],
      deviceTokenHash: hashToken('old-token'),
    }],
  });
  t.after(fixture.restore);

  const result = await deviceRegistryService.reissueActivationCode('BG-OUT-A');
  assert.ok(result.ok);
  assert.equal(result.device.isOnline, false);
  assert.equal(deviceById(fixture.getConfig(), 'BG-OUT-A').deviceTokenHash, null);

  const activated = await deviceRegistryService.activateDeviceByCode(result.activationCode);
  assert.ok(activated);
  assert.equal(activated.device.deviceId, 'BG-OUT-A');
  assert.deepEqual(activated.device.cameraIds, ['CAM-OUT-A']);
  assert.deepEqual(activated.device.printerIds, ['PRN-GATE-A']);
});

test('does not reissue activation code for camera devices', async (t) => {
  const fixture = mockDevicesConfig({ devices: [{ id: 'CAM-OUT-A', deviceId: 'CAM-OUT-A', deviceType: 'camera', status: 'active' }] });
  t.after(fixture.restore);

  const result = await deviceRegistryService.reissueActivationCode('CAM-OUT-A');

  assert.ok(!result.ok);
  assert.equal(result.reason, 'invalid_type');
});

test('validates camera binding from the barrier gate device mapping', async (t) => {
  const fixture = mockDevicesConfig({
    devices: [
      { id: 'CAM-1', deviceId: 'CAM-1', deviceType: 'camera', status: 'active' },
      { id: 'BG-1', deviceId: 'BG-1', deviceType: 'barrier_gate', status: 'active', gateId: 'G1', direction: 'OUT', cameraIds: ['CAM-1'] },
    ],
  });
  t.after(fixture.restore);

  const binding = await deviceRegistryService.validateCameraGateBinding({ cameraId: 'CAM-1', direction: 'OUT' });
  assert.ok(binding.ok);
  assert.equal(binding.barrierGate.gateId, 'G1');

  const mismatch = await deviceRegistryService.validateCameraGateBinding({ cameraId: 'CAM-1', direction: 'IN' });
  assert.ok(!mismatch.ok);
  assert.equal(mismatch.reason, 'camera_gate_mismatch');
});

test('heartbeat marks a provisioned printer online', async (t) => {
  const fixture = mockDevicesConfig();
  t.after(fixture.restore);
  await deviceRegistryService.provisionCredentialedDevice('printer', { deviceName: 'Printer Gate A', deviceCode: 'PRN-GATE-A' });

  const heartbeat = await deviceRegistryService.updateRegisteredDeviceHeartbeat('PRN-GATE-A', { location: 'Gate A', ip: '192.168.1.80' });
  assert.ok(heartbeat);

  assert.equal(heartbeat.device.isOnline, true);
  assert.equal(heartbeat.device.location, 'Gate A');
  assert.equal(heartbeat.device.ipAddress, '192.168.1.80');
});

test('deleting a camera removes it from barrier gate mappings', async (t) => {
  const fixture = mockDevicesConfig({
    devices: [
      { id: 'CAM-1', deviceId: 'CAM-1', deviceType: 'camera', status: 'active' },
      { id: 'BG-1', deviceId: 'BG-1', deviceType: 'barrier_gate', status: 'active', cameraIds: ['CAM-1', 'CAM-2'], printerIds: [] },
    ],
  });
  t.after(fixture.restore);

  await deviceRegistryService.deleteDevice('CAM-1');

  assert.deepEqual(fixture.getConfig().devices.map((device) => device.id), ['BG-1']);
  assert.deepEqual(deviceById(fixture.getConfig(), 'BG-1').cameraIds, ['CAM-2']);
});

test('device type cannot be changed because the token belongs to the original type', async (t) => {
  const fixture = mockDevicesConfig({ devices: [{ id: 'K-1', deviceId: 'K-1', deviceType: 'kiosk', status: 'active' }] });
  t.after(fixture.restore);

  const result = await deviceRegistryService.updateDevice('K-1', { deviceType: 'camera', deviceName: 'Kiosk 1' });

  assert.deepEqual(result, { ok: false, reason: 'device_type_immutable' });
  assert.equal(deviceById(fixture.getConfig(), 'K-1').deviceType, 'kiosk');
});

test('registers EDC devices without a token and rejects a duplicate terminalId', async (t) => {
  const fixture = mockDevicesConfig();
  t.after(fixture.restore);

  const created = await deviceRegistryService.provisionEdcDevice({ deviceName: 'EDC Counter 1', terminalId: 'TID-1', usage: 'cashier' });
  const duplicate = await deviceRegistryService.provisionEdcDevice({ deviceName: 'EDC Counter 2', terminalId: 'TID-1' });

  assert.ok(created.ok);
  assert.deepEqual([created.device.deviceType, created.device.usage, tokenHashOf(created.device)], ['edc', 'cashier', undefined]);
  assert.match(created.device.deviceId ?? '', /^EDC-/);
  assert.deepEqual(duplicate, { ok: false, reason: 'terminal_id_exists' });
  assert.equal((await deviceRegistryService.getCashierEdc(created.device.deviceId)).ok, true);
});

test('binds one device-usage EDC to one kiosk or barrier gate only', async (t) => {
  const fixture = mockDevicesConfig({
    devices: [
      { id: 'EDC-1', deviceId: 'EDC-1', deviceType: 'edc', terminalId: 'TID-1', usage: 'device', status: 'active' },
      { id: 'EDC-C', deviceId: 'EDC-C', deviceType: 'edc', terminalId: 'TID-C', usage: 'cashier', status: 'active' },
      { id: 'K-1', deviceId: 'K-1', deviceType: 'kiosk', status: 'active' },
      { id: 'K-2', deviceId: 'K-2', deviceType: 'kiosk', status: 'active' },
      { id: 'PRN-1', deviceId: 'PRN-1', deviceType: 'printer', status: 'active' },
    ],
  });
  t.after(fixture.restore);

  assert.equal((await deviceRegistryService.updateDevice('K-1', { edcDeviceId: 'EDC-1' }))?.ok, true);
  assert.deepEqual(await deviceRegistryService.updateDevice('K-2', { edcDeviceId: 'EDC-1' }), { ok: false, reason: 'edc_in_use' });
  assert.deepEqual(await deviceRegistryService.updateDevice('K-2', { edcDeviceId: 'EDC-C' }), { ok: false, reason: 'edc_usage_invalid' });
  assert.deepEqual(await deviceRegistryService.updateDevice('PRN-1', { edcDeviceId: 'EDC-1' }), { ok: false, reason: 'edc_owner_invalid' });
  // EDC ที่ถูกผูกอยู่ เปลี่ยนเป็นเครื่องเคาน์เตอร์ไม่ได้
  assert.deepEqual(await deviceRegistryService.updateDevice('EDC-1', { usage: 'cashier' }), { ok: false, reason: 'edc_in_use' });

  const resolved = await deviceRegistryService.resolveDeviceEdc(deviceById(fixture.getConfig(), 'K-1'));
  assert.ok(resolved.ok);
  assert.equal(resolved.edc.terminalId, 'TID-1');

  // ลบ EDC แล้ว Kiosk ไม่ผูกกับเครื่องนั้นอีก
  await deviceRegistryService.deleteDevice('EDC-1');
  assert.equal(deviceById(fixture.getConfig(), 'K-1').edcDeviceId, null);
});

test('rejects cameraIds and printerIds that are not registered cameras or printers', async (t) => {
  const fixture = mockDevicesConfig({
    devices: [
      { id: 'CAM-1', deviceId: 'CAM-1', deviceType: 'camera', deviceCode: 'CAM-1', status: 'active' },
      { id: 'PRN-1', deviceId: 'PRN-1', deviceType: 'printer', deviceCode: 'PRN-1', status: 'active' },
      { id: 'GATE-1', deviceId: 'GATE-1', deviceType: 'barrier_gate', deviceCode: 'GATE-1', status: 'active', cameraIds: [], printerIds: [] },
    ],
  });
  t.after(fixture.restore);

  // printer ใส่ใน cameraIds ไม่ได้ และ id ที่ไม่มีจริงต้องถูกปฏิเสธ
  const update = await deviceRegistryService.updateDevice('GATE-1', { cameraIds: ['CAM-1', 'PRN-1'], printerIds: ['PRN-1'] });
  const create = await deviceRegistryService.createActivationDevice({ deviceType: 'kiosk', deviceName: 'Kiosk A', printerIds: ['PRN-404'] });
  const valid = await deviceRegistryService.updateDevice('GATE-1', { cameraIds: ['CAM-1'], printerIds: ['PRN-1'] });

  assert.deepEqual(update, { ok: false, reason: 'invalid_device_mapping', details: { field: 'cameraIds', invalidIds: ['PRN-1'] } });
  assert.deepEqual(create, { ok: false, reason: 'invalid_device_mapping', details: { field: 'printerIds', invalidIds: ['PRN-404'] } });
  assert.ok(valid?.ok);
});

test('a camera can be mapped to one barrier gate only and must be removed before moving it', async (t) => {
  const fixture = mockDevicesConfig({
    devices: [
      { id: 'CAM-1', deviceId: 'CAM-1', deviceType: 'camera', deviceCode: 'CAM-1', status: 'active' },
      { id: 'GATE-A', deviceId: 'GATE-A', deviceType: 'barrier_gate', deviceCode: 'GATE-A', status: 'active', cameraIds: ['CAM-1'], printerIds: [] },
      { id: 'GATE-B', deviceId: 'GATE-B', deviceType: 'barrier_gate', deviceCode: 'GATE-B', status: 'active', cameraIds: [], printerIds: [] },
    ],
  });
  t.after(fixture.restore);
  const conflict = { ok: false, reason: 'camera_in_use', details: { field: 'cameraIds', cameraIds: ['CAM-1'], assignedTo: [{ cameraId: 'CAM-1', deviceId: 'GATE-A' }] } };

  // ผูกกล้องที่อยู่กับ GATE-A ให้ gate อื่นไม่ได้ ทั้งตอนแก้ไขและตอนสร้าง
  assert.deepEqual(await deviceRegistryService.updateDevice('GATE-B', { cameraIds: ['CAM-1'] }), conflict);
  assert.deepEqual(await deviceRegistryService.createActivationDevice({ deviceType: 'barrier_gate', deviceName: 'Gate C', cameraIds: ['CAM-1'] }), conflict);
  // gate เดิมบันทึกกล้องตัวเดิมซ้ำได้
  assert.ok((await deviceRegistryService.updateDevice('GATE-A', { cameraIds: ['CAM-1'], note: 'edited' }))?.ok);

  // ย้ายกล้อง: เอาออกจาก GATE-A ก่อนแล้วค่อยผูก GATE-B
  assert.ok((await deviceRegistryService.updateDevice('GATE-A', { cameraIds: [] }))?.ok);
  assert.ok((await deviceRegistryService.updateDevice('GATE-B', { cameraIds: ['CAM-1'] }))?.ok);
  assert.deepEqual(deviceById(fixture.getConfig(), 'GATE-B').cameraIds, ['CAM-1']);
});

test('maps and unmaps one camera or printer at a time without sending the whole list', async (t) => {
  const fixture = mockDevicesConfig({
    devices: [
      { id: 'CAM-1', deviceId: 'CAM-1', deviceType: 'camera', deviceCode: 'CAM-1', status: 'active' },
      { id: 'CAM-2', deviceId: 'CAM-2', deviceType: 'camera', deviceCode: 'CAM-2', status: 'active' },
      { id: 'PRN-1', deviceId: 'PRN-1', deviceType: 'printer', deviceCode: 'PRN-1', status: 'active' },
      { id: 'GATE-A', deviceId: 'GATE-A', deviceType: 'barrier_gate', deviceCode: 'GATE-A', status: 'active', cameraIds: ['CAM-1', 'CAM-OLD'], printerIds: [] },
      { id: 'GATE-B', deviceId: 'GATE-B', deviceType: 'barrier_gate', deviceCode: 'GATE-B', status: 'active', cameraIds: [], printerIds: [] },
      { id: 'KIOSK-1', deviceId: 'KIOSK-1', deviceType: 'kiosk', deviceCode: 'KIOSK-1', status: 'active', printerIds: [] },
    ],
  });
  t.after(fixture.restore);
  const change = deviceRegistryService.changeDeviceMapping;

  // เพิ่มทีละตัวโดยคงตัวเดิมไว้ ส่งซ้ำได้ผลเดิม
  assert.ok((await change('GATE-A', { field: 'cameraIds', deviceId: 'CAM-2', action: 'add' }))?.ok);
  assert.ok((await change('GATE-A', { field: 'cameraIds', deviceId: 'CAM-2', action: 'add' }))?.ok);
  // ถอด id เก่าที่ไม่มีอุปกรณ์อยู่แล้วได้ (ล้างข้อมูลค้าง)
  assert.ok((await change('GATE-A', { field: 'cameraIds', deviceId: 'CAM-OLD', action: 'remove' }))?.ok);
  assert.deepEqual(deviceById(fixture.getConfig(), 'GATE-A').cameraIds, ['CAM-1', 'CAM-2']);
  // printer ใช้ร่วมได้ทั้ง Kiosk และ Barrier Gate
  assert.ok((await change('KIOSK-1', { field: 'printerIds', deviceId: 'PRN-1', action: 'add' }))?.ok);
  assert.ok((await change('GATE-B', { field: 'printerIds', deviceId: 'PRN-1', action: 'add' }))?.ok);

  // กล้องที่อยู่กับ GATE-A แล้วผูก GATE-B ไม่ได้, printer ใส่เป็นกล้องไม่ได้, Kiosk ไม่มีกล้อง
  const conflict = await change('GATE-B', { field: 'cameraIds', deviceId: 'CAM-1', action: 'add' });
  assert.equal(conflict?.ok === false ? conflict.reason : null, 'camera_in_use');
  assert.deepEqual(await change('GATE-B', { field: 'cameraIds', deviceId: 'PRN-1', action: 'add' }), { ok: false, reason: 'invalid_device_mapping', details: { field: 'cameraIds', invalidIds: ['PRN-1'] } });
  assert.deepEqual(await change('KIOSK-1', { field: 'cameraIds', deviceId: 'CAM-2', action: 'add' }), { ok: false, reason: 'mapping_owner_invalid' });
  assert.equal(await change('GATE-404', { field: 'cameraIds', deviceId: 'CAM-2', action: 'add' }), null);
});
