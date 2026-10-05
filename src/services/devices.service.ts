// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
// Import Types
import type { DeviceCounts, DeviceMutationResponse, ErrorSpec } from '../types/devices.type';
import type { CameraAssignmentConflict, DeviceMappingError, DevicePayload, SafeDevice } from '../types/shared/device.type';
// Import Validation
import { createActivationBodySchema, provisionDeviceBodySchema, provisionEdcBodySchema, updateDeviceBodySchema } from '../validation/devices.schema';
import { parseWithSchema } from '../validation/zod';
// Import Utils
import { ApiError } from '../utils/api-error';

/* -------------------------------------- Config -------------------------------------- */

// Config field เสริมใน error response ของ Devices API (คงรูปแบบเดิม { status: 'error' })
const DEVICE_ERROR_DETAILS = { status: 'error' };

// Config error ของการออก activation code ใหม่ตามเหตุผลจาก device registry
const REISSUE_ERRORS: Record<string, ErrorSpec> = {
  not_found: [404, 'DEVICE_NOT_FOUND', 'Device not found'],
  invalid_type: [400, 'DEVICE_TYPE_NOT_ACTIVATABLE', 'Activation code can only be reissued for kiosk or barrier_gate devices'],
  maintenance: [403, 'DEVICE_MAINTENANCE', 'Device is currently under maintenance'],
};

// Config error ของการสร้าง/แก้ไขอุปกรณ์ตามเหตุผลจาก device registry
const DEVICE_WRITE_ERRORS: Record<string, ErrorSpec> = {
  duplicate: [409, 'DEVICE_CODE_EXISTS', 'Device code already exists'],
  device_type_immutable: [400, 'DEVICE_TYPE_IMMUTABLE', 'deviceType cannot be changed'],
  edc_not_found: [400, 'EDC_DEVICE_NOT_FOUND', 'edcDeviceId is not a registered EDC device'],
  edc_usage_invalid: [400, 'EDC_USAGE_INVALID', 'Only EDC devices with usage device can be bound to a kiosk or barrier gate'],
  edc_in_use: [409, 'EDC_DEVICE_IN_USE', 'EDC device is already bound to a kiosk or barrier gate'],
  edc_owner_invalid: [400, 'EDC_OWNER_INVALID', 'Only kiosk and barrier gate can be bound to an EDC device'],
  terminal_id_required: [400, 'EDC_TERMINAL_ID_REQUIRED', 'terminalId is required'],
  terminal_id_exists: [409, 'EDC_TERMINAL_ID_EXISTS', 'terminalId is already used by another EDC device'],
  invalid_device_mapping: [400, 'INVALID_DEVICE_MAPPING', 'cameraIds/printerIds must reference registered camera/printer devices'],
  camera_in_use: [409, 'CAMERA_IN_USE', 'Camera is already mapped to another barrier gate, remove it there first'],
  mapping_owner_invalid: [400, 'DEVICE_MAPPING_NOT_SUPPORTED', 'Cameras can be mapped to barrier gates only and printers to kiosks or barrier gates'],
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลงเหตุผลที่บันทึกอุปกรณ์ไม่ได้เป็น ApiError (คงรูปแบบ { status: 'error' } เดิม, details เช่น field/invalidIds ของ mapping ที่ผิด หรือ gate ที่ผูกกล้องอยู่)
function toDeviceWriteError(reason: string, details?: DeviceMappingError | CameraAssignmentConflict): ApiError {
  const [statusCode, code, message]: ErrorSpec = DEVICE_WRITE_ERRORS[reason] || [400, 'DEVICE_UPDATE_FAILED', 'Unable to save device'];
  return new ApiError(statusCode, code, message, { ...DEVICE_ERROR_DETAILS, ...details });
}

// Function เลือกเฉพาะ field ที่มีค่าจาก body เพื่อใช้สร้างอุปกรณ์รอ activate
function toActivationPayload(body: DevicePayload, deviceType: string): DevicePayload {
  return {
    ...(body.deviceName ? { deviceName: body.deviceName } : {}),
    ...(body.name ? { name: body.name } : {}),
    ...(body.deviceCode ? { deviceCode: body.deviceCode } : {}),
    ...(body.location ? { location: body.location } : {}),
    ...(body.gateId ? { gateId: body.gateId } : {}),
    ...(body.direction ? { direction: body.direction } : {}),
    ...(Array.isArray(body.cameraIds) ? { cameraIds: body.cameraIds } : {}),
    ...(Array.isArray(body.printerIds) ? { printerIds: body.printerIds } : {}),
    ...(body.connectionType ? { connectionType: body.connectionType } : {}),
    ...(body.edcDeviceId ? { edcDeviceId: body.edcDeviceId } : {}),
    ...(Array.isArray(body.allowedIps) ? { allowedIps: body.allowedIps } : {}),
    ...(body.note ? { note: body.note } : {}),
    deviceType,
  };
}

// Function ตรวจว่าอุปกรณ์ตรงกับ keyword จาก id, ชื่อ, ประเภท, สถานะ, ที่ตั้ง หรือ IP
function matchesKeyword(device: SafeDevice, keyword: string): boolean {
  const normalized = String(keyword).trim().toLowerCase();
  return [device.id, device.deviceId, device.deviceCode, device.deviceName, device.deviceType, device.status, device.location, device.ipAddress]
    .some((value) => String(value || '').toLowerCase().includes(normalized));
}

// Function นับจำนวนอุปกรณ์ตามสถานะ
function summarizeDevices(devices: SafeDevice[]): DeviceCounts {
  return {
    total: devices.length,
    online: devices.filter((device) => device.isOnline).length,
    offline: devices.filter((device) => !device.isOnline && device.status !== 'maintenance').length,
    maintenance: devices.filter((device) => device.status === 'maintenance').length,
  };
}

// Function แปลงอุปกรณ์เป็น response หลังสร้าง/แก้ไข (ไม่มี token และ activation code)
function toDeviceMutationResponse(device: SafeDevice): DeviceMutationResponse {
  return {
    deviceId: device.deviceId || device.id,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    connectionType: device.connectionType,
    location: device.location || null,
    ipAddress: device.ipAddress || null,
    gateId: device.gateId || null,
    direction: device.direction || null,
    cameraIds: Array.isArray(device.cameraIds) ? device.cameraIds : [],
    cameraRole: device.cameraRole || null,
    printerIds: Array.isArray(device.printerIds) ? device.printerIds : [],
    printerRole: device.printerRole || null,
    edcDeviceId: device.edcDeviceId || null,
    terminalId: device.terminalId || null,
    merchantId: device.merchantId || null,
    provider: device.provider || null,
    serialNo: device.serialNo || null,
    usage: device.usage || null,
    allowedIps: Array.isArray(device.allowedIps) ? device.allowedIps : [],
    status: device.status,
    isOnline: Boolean(device.isOnline),
    note: device.note || '',
  };
}

// Function provision camera/printer แล้วสร้าง response พร้อม device token ที่แสดงครั้งเดียว
async function provisionDevice(deviceType: 'camera' | 'printer', body: unknown, message: string): Promise<{ success: true; message: string; device: DeviceMutationResponse; deviceToken: string }> {
  const payload = parseWithSchema(provisionDeviceBodySchema, body, { details: DEVICE_ERROR_DETAILS });
  const result = await deviceRegistryService.provisionCredentialedDevice(deviceType, payload);
  if (!result.ok) throw new ApiError(409, 'DEVICE_CODE_EXISTS', 'Device code already exists', DEVICE_ERROR_DETAILS);

  return { success: true as const, message, device: toDeviceMutationResponse(result.device), deviceToken: result.deviceToken };
}

// Function สร้าง kiosk/barrier gate ที่รอ activate พร้อม activation code
async function createActivationCode(body: unknown): Promise<{ CodeActivate: string; deviceName: string; deviceType: string; status: 'active'; isOnline: true }> {
  const data = parseWithSchema(createActivationBodySchema, body, { details: DEVICE_ERROR_DETAILS });
  const payload = toActivationPayload(data, data.deviceType);
  const result = await deviceRegistryService.createActivationDevice(payload);
  if (!result.ok) throw toDeviceWriteError(result.reason, result.details);

  return {
    CodeActivate: result.activationCode,
    deviceName: payload.deviceName || payload.name || result.device.id,
    deviceType: result.device.deviceType,
    status: 'active' as const,
    isOnline: true as const,
  };
}

// Function ลงทะเบียนเครื่อง EDC (ไม่มี device token) usage cashier = เคาน์เตอร์ Admin, device = ผูกกับ Kiosk/Barrier Gate
async function provisionEdc(body: unknown): Promise<{ success: true; message: string; device: DeviceMutationResponse }> {
  const payload = parseWithSchema(provisionEdcBodySchema, body, { details: DEVICE_ERROR_DETAILS });
  const result = await deviceRegistryService.provisionEdcDevice(payload);
  if (!result.ok) throw toDeviceWriteError(result.reason);

  return { success: true as const, message: 'EDC device registered', device: toDeviceMutationResponse(result.device) };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงรายการอุปกรณ์พร้อม filter deviceType, status, keyword และสรุปจำนวนตามสถานะ
async function listDevices({ deviceType, status, keyword }: { deviceType?: string; status?: string; keyword?: string } = {}): Promise<DeviceCounts & { devices: SafeDevice[]; configUpdatedAt: string | null }> {
  const config = deviceRegistryService.toSafeConfig(await deviceRegistryService.getDevicesConfigWithMeta());
  let devices = Array.isArray(config.devices) ? config.devices : [];
  if (deviceType) devices = devices.filter((device) => device.deviceType === deviceType);
  if (status) devices = devices.filter((device) => device.status === status);
  if (keyword) devices = devices.filter((device) => matchesKeyword(device, keyword));

  return { ...summarizeDevices(devices), devices, configUpdatedAt: config.configUpdatedAt };
}

// Function สร้างอุปกรณ์ตาม deviceType: camera/printer ได้ deviceToken ที่แสดงครั้งเดียว, edc ไม่มี token, ที่เหลือเป็น kiosk/barrier gate ที่ได้ activation code
async function createDevice(body: unknown): Promise<Awaited<ReturnType<typeof createActivationCode>> | Awaited<ReturnType<typeof provisionDevice>> | Awaited<ReturnType<typeof provisionEdc>>> {
  const deviceType = body && typeof body === 'object' ? (body as { deviceType?: unknown }).deviceType : undefined;
  if (deviceType === 'camera') return provisionDevice('camera', body, 'Camera provisioned');
  if (deviceType === 'printer') return provisionDevice('printer', body, 'Printer provisioned');
  if (deviceType === 'edc') return provisionEdc(body);
  return createActivationCode(body);
}

// Function ออก activation code ใหม่ให้ kiosk/barrier gate เดิมที่ token หาย
async function reissueActivationCode(deviceId: string): Promise<{ success: true; message: string; deviceId: string; deviceName: string; deviceType: string; activationCode: string; expiresAt: string; device: DeviceMutationResponse }> {
  const result = await deviceRegistryService.reissueActivationCode(deviceId);
  if (!result.ok) {
    const [statusCode, code, message]: ErrorSpec = REISSUE_ERRORS[result.reason] || [400, 'ACTIVATION_REISSUE_FAILED', 'Unable to reissue activation code'];
    throw new ApiError(statusCode, code, message, DEVICE_ERROR_DETAILS);
  }

  return {
    success: true as const,
    message: 'Activation code reissued',
    deviceId: result.device.deviceId || result.device.id,
    deviceName: result.device.deviceName,
    deviceType: result.device.deviceType,
    activationCode: result.activationCode,
    expiresAt: result.expiresAt,
    device: toDeviceMutationResponse(result.device),
  };
}

// Function แก้ไขข้อมูลหรือ mapping cameraIds/printerIds ของอุปกรณ์ (เปลี่ยน deviceType ไม่ได้)
async function updateDevice(deviceId: string, body: unknown): Promise<{ message: string; device: DeviceMutationResponse }> {
  const data = parseWithSchema(updateDeviceBodySchema, body);
  const result = await deviceRegistryService.updateDevice(deviceId, data);
  if (!result) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  if (!result.ok) throw toDeviceWriteError(result.reason, result.details);

  return { message: 'Device updated', device: toDeviceMutationResponse(result.device) };
}

// Function ผูกหรือถอดกล้อง/printer ทีละตัวกับ Kiosk/Barrier Gate โดยไม่ต้องส่ง cameraIds/printerIds ทั้งชุด
async function changeDeviceMapping(deviceId: string, field: 'cameraIds' | 'printerIds', peripheralId: string, action: 'add' | 'remove'): Promise<{ message: string; device: DeviceMutationResponse }> {
  const result = await deviceRegistryService.changeDeviceMapping(deviceId, { field, deviceId: peripheralId, action });
  if (!result) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  if (!result.ok) throw toDeviceWriteError(result.reason, result.details);

  return { message: action === 'add' ? 'Device mapped' : 'Device unmapped', device: toDeviceMutationResponse(result.device) };
}

// Function ลบอุปกรณ์
async function deleteDevice(deviceId: string): Promise<{ success: true; message: string }> {
  const result = await deviceRegistryService.deleteDevice(deviceId);
  if (!result) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found');

  return { success: true as const, message: 'Device deleted' };
}

export { changeDeviceMapping, createDevice, deleteDevice, listDevices, reissueActivationCode, updateDevice };
