// Import Types
import type { DeviceApi, DeviceApiBase, NetworkDeviceApiFields, SafeDevice } from '../../types/shared/device.type';

/* -------------------------------------- Helpers -------------------------------------- */

// Function อ่านรายการ string (cameraIds, printerIds, allowedIps) ถ้าไม่ใช่ array คืน []
function toIdList(value: unknown): string[] {
  return Array.isArray(value) ? value : [];
}

// Function ดึง field ของอุปกรณ์ที่ต่อเครือข่าย (kiosk, barrier gate, camera, printer)
function toNetworkFields(device: SafeDevice): NetworkDeviceApiFields {
  return {
    connectionType: device.connectionType ?? null,
    ipAddress: device.ipAddress ?? null,
    lastSeen: device.lastSeen ?? null,
    activatedAt: device.activatedAt ?? null,
    allowedIps: toIdList(device.allowedIps),
    gateId: device.gateId ?? null,
    direction: device.direction === 'IN' || device.direction === 'OUT' ? device.direction : null,
    cameraRole: device.cameraRole ?? null,
    printerRole: device.printerRole ?? null,
  };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลงอุปกรณ์ใน devices config เป็นรูปแบบ API ที่มี key ครบตาม deviceType (ไม่มี token hash)
function toDeviceApi(device: SafeDevice): DeviceApi {
  const base: DeviceApiBase = {
    id: device.id,
    deviceId: device.deviceId ?? null,
    deviceCode: device.deviceCode ?? null,
    deviceName: device.deviceName,
    location: device.location ?? null,
    status: device.status,
    isOnline: Boolean(device.isOnline),
    note: device.note ?? null,
  };

  if (device.deviceType === 'edc') {
    return {
      ...base,
      deviceType: 'edc',
      deviceId: device.deviceId ?? device.id,
      isOnline: false,
      terminalId: device.terminalId ?? '',
      merchantId: device.merchantId ?? null,
      provider: device.provider ?? null,
      serialNo: device.serialNo ?? null,
      usage: device.usage === 'cashier' ? 'cashier' : 'device',
    };
  }

  if (device.deviceType === 'camera' || device.deviceType === 'printer') {
    return { ...base, ...toNetworkFields(device), deviceType: device.deviceType, deviceId: device.deviceId ?? device.id };
  }

  // device registry สร้างอุปกรณ์ได้แค่ 5 ประเภท ที่เหลือคือ kiosk/barrier gate ที่ใช้ activation code
  return {
    ...base,
    ...toNetworkFields(device),
    deviceType: device.deviceType === 'barrier_gate' ? 'barrier_gate' : 'kiosk',
    activationCode: device.activationCode ?? null,
    activationExpiresAt: device.activationExpiresAt ?? null,
    cameraIds: toIdList(device.cameraIds),
    printerIds: toIdList(device.printerIds),
    edcDeviceId: device.edcDeviceId ?? null,
  };
}

export { toDeviceApi };
