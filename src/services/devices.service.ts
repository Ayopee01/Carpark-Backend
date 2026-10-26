// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
// Import Types
import type { DeviceCounts, ErrorSpec } from '../types/devices.type';
import type { CameraAssignmentConflict, DeviceApi, DeviceMappingError, DevicePayload, DeviceStatus, SafeDevice } from '../types/shared/device.type';
// Import Validation
import { createActivationBodySchema, deviceListQuerySchema, provisionDeviceBodySchema, provisionEdcBodySchema, updateDeviceBodySchema } from '../validation/schemas';
import { parseWithSchema } from '../validation/parser';
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
  inactive: [403, 'DEVICE_INACTIVE', 'Device is inactive, set status to active first'],
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
  status_pending_activation: [409, 'DEVICE_PENDING_ACTIVATION', 'Device waiting for activation cannot change status, activate it with the activation code first'],
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
    offline: devices.filter((device) => !device.isOnline && device.status !== 'maintenance' && device.status !== 'inactive').length,
    maintenance: devices.filter((device) => device.status === 'maintenance').length,
    inactive: devices.filter((device) => device.status === 'inactive').length,
  };
}

// Function provision camera/printer แล้วสร้าง response พร้อม device token ที่แสดงครั้งเดียว
async function provisionDevice(deviceType: 'camera' | 'printer', body: unknown, message: string): Promise<{ success: true; message: string; device: DeviceApi; deviceToken: string }> {
  const payload = parseWithSchema(provisionDeviceBodySchema, body, { details: DEVICE_ERROR_DETAILS });
  const result = await deviceRegistryService.provisionCredentialedDevice(deviceType, payload);
  if (!result.ok) throw new ApiError(409, 'DEVICE_CODE_EXISTS', 'Device code already exists', DEVICE_ERROR_DETAILS);

  return { success: true as const, message, device: deviceRegistryService.toDeviceApi(result.device), deviceToken: result.deviceToken };
}

// Function สร้าง kiosk/barrier gate ที่รอ activate พร้อม activation code (status เป็น pending_activation จนกว่าจะ activate)
async function createActivationCode(body: unknown): Promise<{ CodeActivate: string; activationExpiresAt: string; deviceName: string; deviceType: string; status: DeviceStatus; isOnline: boolean; device: DeviceApi }> {
  const data = parseWithSchema(createActivationBodySchema, body, { details: DEVICE_ERROR_DETAILS });
  const payload = toActivationPayload(data, data.deviceType);
  const result = await deviceRegistryService.createActivationDevice(payload);
  if (!result.ok) throw toDeviceWriteError(result.reason, result.details);

  return {
    CodeActivate: result.activationCode,
    activationExpiresAt: result.activationExpiresAt,
    deviceName: result.device.deviceName,
    deviceType: result.device.deviceType,
    status: result.device.status,
    isOnline: result.device.isOnline,
    device: deviceRegistryService.toDeviceApi(result.device),
  };
}

// Function ลงทะเบียนเครื่อง EDC (ไม่มี device token) usage cashier = เคาน์เตอร์ Admin, device = ผูกกับ Kiosk/Barrier Gate
async function provisionEdc(body: unknown): Promise<{ success: true; message: string; device: DeviceApi }> {
  const payload = parseWithSchema(provisionEdcBodySchema, body, { details: DEVICE_ERROR_DETAILS });
  const result = await deviceRegistryService.provisionEdcDevice(payload);
  if (!result.ok) throw toDeviceWriteError(result.reason);

  return { success: true as const, message: 'EDC device registered', device: deviceRegistryService.toDeviceApi(result.device) };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงรายการอุปกรณ์พร้อม filter deviceType, status, keyword และสรุปจำนวนตามสถานะ
async function listDevices(query: unknown = {}): Promise<DeviceCounts & { devices: DeviceApi[]; configUpdatedAt: string | null }> {
  const { deviceType, status, keyword } = parseWithSchema(deviceListQuerySchema, query);
  const config = await deviceRegistryService.getDevicesConfigWithMeta();
  let devices: SafeDevice[] = config.devices;
  if (deviceType) devices = devices.filter((device) => device.deviceType === deviceType);
  if (status) devices = devices.filter((device) => device.status === status);
  if (keyword) devices = devices.filter((device) => matchesKeyword(device, keyword));

  return { ...summarizeDevices(devices), devices: devices.map((device) => deviceRegistryService.toDeviceApi(device)), configUpdatedAt: config.configUpdatedAt };
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
async function reissueActivationCode(deviceId: string): Promise<{ success: true; message: string; deviceId: string; deviceName: string; deviceType: string; activationCode: string; expiresAt: string; device: DeviceApi }> {
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
    device: deviceRegistryService.toDeviceApi(result.device),
  };
}

// Function แก้ไขข้อมูลหรือ mapping cameraIds/printerIds ของอุปกรณ์ (เปลี่ยน deviceType ไม่ได้)
async function updateDevice(deviceId: string, body: unknown): Promise<{ message: string; device: DeviceApi }> {
  const data = parseWithSchema(updateDeviceBodySchema, body);
  const result = await deviceRegistryService.updateDevice(deviceId, data);
  if (!result) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  if (!result.ok) throw toDeviceWriteError(result.reason, result.details);

  return { message: 'Device updated', device: deviceRegistryService.toDeviceApi(result.device) };
}

// Function ลบอุปกรณ์
async function deleteDevice(deviceId: string): Promise<{ success: true; message: string }> {
  const result = await deviceRegistryService.deleteDevice(deviceId);
  if (!result) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found');

  return { success: true as const, message: 'Device deleted' };
}

export { createDevice, deleteDevice, listDevices, reissueActivationCode, updateDevice };
