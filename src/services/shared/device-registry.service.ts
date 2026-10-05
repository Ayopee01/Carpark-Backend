// Import Library
import crypto from 'crypto';
// Import Repositories
import * as configRepository from '../../repositories/config.repository';
// Import Types
import type { WithConfigMeta } from '../../types/shared/config.type';
import type { CameraAssignmentConflict, CameraGateBindingResult, CreateActivationResult, DeviceEvent, DeviceMappingError, DevicePayload, DeviceRecord, DevicesConfig, DeviceTokenResult, EdcLookupResult, HeartbeatDetails, ProvisionEdcResult, ProvisionResult, ReissueResult, SafeDevice, UpdateDeviceResult } from '../../types/shared/device.type';
// Import Utils
import { isExpired } from '../../utils/date';
import { appEvents } from '../../utils/events';
import { hashToken, timingSafeStringEqual } from '../../utils/crypto';

/* -------------------------------------- Config -------------------------------------- */

// Config เวลาที่ไม่มี heartbeat แล้วถือว่าอุปกรณ์ offline (นาที)
const OFFLINE_AFTER_MINUTES = 5;

// Config ประเภทอุปกรณ์ที่ใช้ deviceId + deviceToken ยืนยันตัวตน
const CREDENTIALED_DEVICE_TYPES = new Set<string>(['kiosk', 'barrier_gate', 'camera', 'printer']);

// Config ประเภทอุปกรณ์ที่เปิดใช้งานด้วย activation code (camera/printer ใช้ provision ตรง)
const ACTIVATION_CODE_DEVICE_TYPES = new Set<string>(['kiosk', 'barrier_gate']);

// Config อายุ activation code
const ACTIVATION_TTL_MS = 10 * 60 * 1000;

// Config prefix ของ deviceId ที่ระบบสร้างให้แต่ละประเภท
const DEVICE_ID_PREFIXES: Record<string, string> = { kiosk: 'K', barrier_gate: 'BG', camera: 'CAM', printer: 'PRN', edc: 'EDC' };

// Config ประเภทอุปกรณ์ที่ผูกกับเครื่อง EDC ได้ (เครื่อง EDC ของเคาน์เตอร์ Admin ใช้ usage cashier แทน)
const EDC_OWNER_DEVICE_TYPES = new Set<string>(['kiosk', 'barrier_gate']);

// Config ประเภทอุปกรณ์ที่มี mapping แต่ละ field ได้ (กล้องผูกกับ Barrier Gate, printer ผูกกับ Kiosk หรือ Barrier Gate)
const MAPPING_OWNER_DEVICE_TYPES: Record<DeviceMappingError['field'], Set<string>> = {
  cameraIds: new Set(['barrier_gate']),
  printerIds: new Set(['kiosk', 'barrier_gate']),
};

// Config field ที่มีเฉพาะเครื่อง EDC
const EDC_ONLY_FIELDS: (keyof DevicePayload)[] = ['terminalId', 'merchantId', 'provider', 'serialNo', 'usage'];

// Config ระยะเวลาตรวจสถานะ runtime ของอุปกรณ์ในเบื้องหลัง
const RUNTIME_MONITOR_INTERVAL_MS = 30 * 1000;

// Config สถานะที่ใช้ activation code ได้ (pending ครั้งแรก หรือ active/offline หลัง reissue)
const ACTIVATABLE_STATUSES: string[] = ['pending_activation', 'active', 'offline'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function สร้าง device token แบบสุ่ม (เก็บเฉพาะ hash ใน database)
function createDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Function สุ่ม activation code 6 หลักที่ไม่ซ้ำกับ code ที่ยังไม่หมดอายุของอุปกรณ์อื่น
function createActivationCode(devices: DeviceRecord[], excludeIndex = -1): string {
  let code: string;
  do {
    code = crypto.randomInt(100000, 1000000).toString();
  } while (devices.some((device, index) => index !== excludeIndex && device.activationCode === code && !isExpired(device.activationExpiresAt)));
  return code;
}

// Function สร้าง deviceId รูปแบบ PREFIX-YYYYMMDD-NNN โดยข้ามเลขที่ถูกใช้แล้ว
function generateDeviceId(devices: DeviceRecord[], deviceType: string | null | undefined, now: Date = new Date()): string {
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const usedIds = new Set(devices.flatMap((device) => [device.id, device.deviceId, device.deviceCode]).filter(Boolean));
  let sequence = devices.filter((device) => device.deviceType === deviceType).length + 1;
  let deviceId: string;
  do {
    deviceId = `${DEVICE_ID_PREFIXES[deviceType ?? ''] ?? 'DEV'}-${dateStr}-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (usedIds.has(deviceId));
  return deviceId;
}

// Function ตรวจว่าอุปกรณ์ต้องใช้ device token หรือไม่
function isCredentialedDevice(device: Pick<DeviceRecord, 'deviceType'> | null | undefined): boolean {
  return CREDENTIALED_DEVICE_TYPES.has(device?.deviceType ?? '');
}

// Function ตรวจว่าอุปกรณ์เปิดใช้งานด้วย activation code หรือไม่
function isActivationCodeDevice(device: Pick<DeviceRecord, 'deviceType'> | null | undefined): boolean {
  return ACTIVATION_CODE_DEVICE_TYPES.has(device?.deviceType ?? '');
}

// Function ตรวจว่า lastSeen เก่ากว่าเวลาที่กำหนดจนถือว่า offline แล้ว
function isOfflineByLastSeen(lastSeen: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSeen) return true;
  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return true;
  return now.getTime() - date.getTime() > OFFLINE_AFTER_MINUTES * 60000;
}

// Function แปลง direction เป็น IN/OUT คืน null ถ้าไม่ใช่ทั้งสองค่า
function normalizeDirection(direction: unknown): 'IN' | 'OUT' | null {
  const value = String(direction || '').trim().toUpperCase();
  return value === 'IN' || value === 'OUT' ? value : null;
}

// Function ทำให้รายการ device id ไม่ซ้ำและไม่มีค่าว่าง
function normalizeDeviceIds(deviceIds: unknown): string[] {
  if (!Array.isArray(deviceIds)) return [];
  return [...new Set(deviceIds.map((deviceId) => String(deviceId || '').trim()).filter(Boolean))];
}

// Function ทำให้รายการ IP ที่อนุญาตไม่ซ้ำและไม่มีค่าว่าง (ว่าง = ไม่จำกัด IP)
function normalizeAllowedIps(ips: unknown): string[] {
  if (!Array.isArray(ips)) return [];
  return [...new Set(ips.map((ip) => String(ip || '').trim()).filter(Boolean))];
}

// Function หาเครื่อง EDC จาก deviceId หรือ id คืน null ถ้าไม่พบ
function findEdc(devices: DeviceRecord[], edcDeviceId: string | null | undefined): DeviceRecord | null {
  if (!edcDeviceId) return null;
  return devices.find((device) => device.deviceType === 'edc' && (device.deviceId === edcDeviceId || device.id === edcDeviceId)) || null;
}

// Function หา id ใน cameraIds/printerIds ที่ไม่ใช่กล้อง/printer ที่ลงทะเบียนไว้ (ตรวจเฉพาะ field ที่ส่งมา) คืน null ถ้า mapping ถูกต้อง
function getDeviceMappingError(devices: DeviceRecord[], { cameraIds, printerIds }: Pick<DevicePayload, 'cameraIds' | 'printerIds'>): DeviceMappingError | null {
  const check = (field: DeviceMappingError['field'], ids: unknown, deviceType: string): DeviceMappingError | null => {
    if (ids === undefined) return null;
    const known = new Set(devices.filter((device) => device.deviceType === deviceType).flatMap((device) => [device.id, device.deviceId]));
    const invalidIds = normalizeDeviceIds(ids).filter((id) => !known.has(id));
    return invalidIds.length ? { field, invalidIds } : null;
  };
  return check('cameraIds', cameraIds, 'camera') ?? check('printerIds', printerIds, 'printer');
}

// Function หากล้องใน cameraIds ที่ผูกกับอุปกรณ์อื่นอยู่แล้ว (กล้อง 1 ตัวใช้ได้กับ Barrier Gate เดียว) คืน null ถ้าไม่ชน
function getCameraAssignmentConflict(devices: DeviceRecord[], cameraIds: unknown, ownerId: string): CameraAssignmentConflict | null {
  if (cameraIds === undefined) return null;
  const assignedTo = normalizeDeviceIds(cameraIds).flatMap((cameraId) => devices
    .filter((device) => device.id !== ownerId && normalizeDeviceIds(device.cameraIds).includes(cameraId))
    .map((device) => ({ cameraId, deviceId: device.deviceId || device.id })));
  return assignedTo.length ? { field: 'cameraIds', cameraIds: [...new Set(assignedTo.map((item) => item.cameraId))], assignedTo } : null;
}

// Function ตรวจว่าผูก EDC กับ Kiosk/Barrier Gate ได้ (มีจริง, usage device, ยังไม่ถูกผูกกับเครื่องอื่น) คืนเหตุผลที่ผูกไม่ได้หรือ null
function getEdcBindingError(devices: DeviceRecord[], edcDeviceId: string | null | undefined, ownerId: string): 'edc_not_found' | 'edc_usage_invalid' | 'edc_in_use' | null {
  if (!edcDeviceId) return null;
  const edc = findEdc(devices, edcDeviceId);
  if (!edc) return 'edc_not_found';
  if (edc.usage !== 'device') return 'edc_usage_invalid';
  return devices.some((device) => device.edcDeviceId === edc.deviceId && device.id !== ownerId) ? 'edc_in_use' : null;
}

// Function ทำให้ devices เป็น array และคำนวณ summary online/offline ใหม่
function withSummary<T extends DevicesConfig>(config: T): T & Required<Pick<DevicesConfig, 'summary'>> {
  const devices = Array.isArray(config.devices) ? config.devices : [];
  const online = devices.filter((device) => device.isOnline).length;
  return {
    ...config,
    summary: { totalDevices: devices.length, online, offline: devices.length - online },
    devices,
  };
}

// Function หา index ของอุปกรณ์จาก id, deviceId หรือ deviceCode
function findDeviceIndex(devices: DeviceRecord[], value: string): number {
  return devices.findIndex((device) => device.id === value || device.deviceId === value || device.deviceCode === value);
}

// Function สร้าง payload ของ device_event จากข้อมูลอุปกรณ์
function toDeviceEvent(type: string, device: DeviceRecord | SafeDevice, extra: Record<string, unknown> = {}): DeviceEvent {
  return {
    type,
    deviceId: device.deviceId,
    id: device.id,
    deviceCode: device.deviceCode,
    deviceType: device.deviceType,
    deviceName: device.deviceName,
    ...extra,
  };
}

// Function แจ้ง admin SSE ว่า devices config เปลี่ยน (ส่งเฉพาะข้อมูลที่ไม่มี token hash)
function emitDevicesConfigUpdated(config: DevicesConfig): void {
  appEvents.emit('devices_config_updated', toSafeConfig(withSummary(config)));
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตัด token hash ออกจากข้อมูลอุปกรณ์ก่อนส่งออก
function toSafeDevice(device: DeviceRecord): SafeDevice;
function toSafeDevice(device: DeviceRecord | null | undefined): SafeDevice | null;
function toSafeDevice(device: DeviceRecord | null | undefined): SafeDevice | null {
  if (!device) return null;
  const { deviceTokenHash: _deviceTokenHash, ...safe } = device;
  return safe;
}

// Function ตัด token hash ออกจากอุปกรณ์ทุกตัวใน config
function toSafeConfig<T extends DevicesConfig>(config: T): Omit<T, 'devices'> & { devices: SafeDevice[] } {
  return {
    ...config,
    devices: (Array.isArray(config.devices) ? config.devices : []).map((device) => toSafeDevice(device)),
  };
}

// Function คำนวณสถานะ runtime ใหม่ (ลบ pending ที่หมดอายุ, ล้าง code ที่หมดอายุ, เปลี่ยน active ที่ขาด heartbeat เป็น offline)
function applyRuntimeState(config: DevicesConfig, now: Date): { changed: boolean; devices: DeviceRecord[]; events: DeviceEvent[] } {
  let changed = false;
  const events: DeviceEvent[] = [];

  const devices = (Array.isArray(config.devices) ? config.devices : [])
    .filter((device) => {
      const shouldRemove = device.status === 'pending_activation' && isExpired(device.activationExpiresAt, now);
      if (shouldRemove) {
        changed = true;
        events.push(toDeviceEvent('device_activation_expired', device, { status: 'expired', isOnline: false }));
      }
      return !shouldRemove;
    })
    .map((device): DeviceRecord => {
      if (isActivationCodeDevice(device) && ['active', 'offline'].includes(device.status) && device.activationCode && isExpired(device.activationExpiresAt, now)) {
        changed = true;
        events.push(toDeviceEvent('device_activation_expired', device, { status: device.status, isOnline: device.isOnline }));
        return { ...device, activationCode: null, activationExpiresAt: null };
      }

      if (isCredentialedDevice(device) && device.status === 'active' && device.isOnline && isOfflineByLastSeen(device.lastSeen, now)) {
        changed = true;
        events.push(toDeviceEvent('device_status_changed', device, {
          previousStatus: device.status,
          status: 'offline',
          isOnline: false,
          lastSeen: device.lastSeen,
        }));
        return { ...device, isOnline: false, status: 'offline' };
      }

      return device;
    });

  return { changed, devices, events };
}

// Function ปรับสถานะ runtime ของอุปกรณ์ (อ่านอย่างเดียวถ้าไม่มีอะไรเปลี่ยน เพื่อไม่ล็อก config ทุกครั้งที่ตรวจ device token)
async function refreshDeviceRuntimeState({ emitEvents = false }: { emitEvents?: boolean } = {}): Promise<DevicesConfig> {
  const now = new Date();
  const current = await configRepository.getConfig('devices');
  if (!applyRuntimeState(current, now).changed) return withSummary(current);

  let events: DeviceEvent[] = [];
  const saved = await configRepository.updateConfig('devices', (config) => {
    const result = applyRuntimeState(config, now);
    events = result.events;
    return result.changed ? withSummary({ ...config, devices: result.devices }) : undefined;
  });

  const refreshed = withSummary(saved);
  if (events.length && emitEvents) {
    events.forEach((event) => appEvents.emit('device_event', event));
    appEvents.emit('devices_config_updated', toSafeConfig(refreshed));
  }
  return refreshed;
}

// Function เริ่มตรวจสถานะ runtime ของอุปกรณ์เป็นระยะ เพื่อให้ admin เห็นอุปกรณ์ที่ offline
function startDeviceRuntimeMonitor(): NodeJS.Timeout {
  const interval = setInterval(() => {
    refreshDeviceRuntimeState({ emitEvents: true }).catch((err) => {
      console.error('Device runtime monitor failed:', err);
    });
  }, RUNTIME_MONITOR_INTERVAL_MS);
  interval.unref?.();
  return interval;
}

// Function ดึง devices config หลังปรับสถานะ runtime แล้ว
async function getDevicesConfig(): Promise<DevicesConfig> {
  return refreshDeviceRuntimeState();
}

// Function ดึง devices config พร้อม summary และ configUpdatedAt
async function getDevicesConfigWithMeta(): Promise<WithConfigMeta<DevicesConfig>> {
  await refreshDeviceRuntimeState();
  return withSummary(await configRepository.getConfigWithMeta('devices'));
}

// Function หาอุปกรณ์จาก deviceId หรือ internal id
async function getRegisteredDevice(deviceId: string | null | undefined): Promise<DeviceRecord | null> {
  if (!deviceId) return null;
  const config = await getDevicesConfig();
  return config.devices.find((device) => device.deviceId === deviceId || device.id === deviceId) || null;
}

// Function สร้างอุปกรณ์ kiosk/barrier gate สถานะ pending_activation พร้อม activation code
async function createActivationDevice(payload: DevicePayload = {}): Promise<CreateActivationResult> {
  let result = { ok: false, reason: 'duplicate' } as CreateActivationResult;
  await configRepository.updateConfig('devices', (config) => {
    const devices = Array.isArray(config.devices) ? config.devices : [];
    const deviceId = generateDeviceId(devices, payload.deviceType);
    const deviceCode = payload.deviceCode || deviceId;
    if (devices.some((device) => device.deviceCode === deviceCode || device.id === deviceId)) {
      result = { ok: false, reason: 'duplicate' };
      return undefined;
    }
    const edcError = getEdcBindingError(devices, payload.edcDeviceId, deviceId);
    if (edcError) {
      result = { ok: false, reason: edcError };
      return undefined;
    }
    const mappingError = getDeviceMappingError(devices, payload);
    if (mappingError) {
      result = { ok: false, reason: 'invalid_device_mapping', details: mappingError };
      return undefined;
    }
    const cameraConflict = getCameraAssignmentConflict(devices, payload.cameraIds, deviceId);
    if (cameraConflict) {
      result = { ok: false, reason: 'camera_in_use', details: cameraConflict };
      return undefined;
    }

    const activationCode = createActivationCode(devices);
    const activationExpiresAt = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();
    const device: DeviceRecord = {
      id: deviceId,
      deviceId: null,
      activationCode,
      activationExpiresAt,
      deviceCode,
      deviceName: payload.deviceName || payload.name || deviceId,
      deviceType: payload.deviceType ?? '',
      connectionType: payload.connectionType || 'lan',
      ipAddress: null,
      location: payload.location || null,
      gateId: payload.gateId ? String(payload.gateId).trim() : null,
      direction: normalizeDirection(payload.direction),
      cameraIds: normalizeDeviceIds(payload.cameraIds),
      cameraRole: payload.cameraRole ? String(payload.cameraRole).trim() : null,
      printerIds: normalizeDeviceIds(payload.printerIds),
      printerRole: payload.printerRole ? String(payload.printerRole).trim() : null,
      edcDeviceId: findEdc(devices, payload.edcDeviceId)?.deviceId || null,
      allowedIps: normalizeAllowedIps(payload.allowedIps),
      status: 'pending_activation',
      isOnline: false,
      note: payload.note || 'Waiting for activation',
    };
    result = { ok: true, device: toSafeDevice(device), activationCode, activationExpiresAt };
    return withSummary({ ...config, devices: [...devices, device] });
  });
  return result;
}

// Function provision camera/printer พร้อมออก device token ให้ใช้งานได้ทันที
async function provisionCredentialedDevice(deviceType: 'camera' | 'printer', payload: DevicePayload = {}): Promise<ProvisionResult> {
  const deviceToken = createDeviceToken();
  let device = null as DeviceRecord | null;
  const saved = await configRepository.updateConfig('devices', (config) => {
    device = null;
    const devices = Array.isArray(config.devices) ? config.devices : [];
    const deviceId = payload.deviceId || payload.deviceCode || generateDeviceId(devices, deviceType);
    const deviceCode = payload.deviceCode || deviceId;
    if (devices.some((item) => item.id === deviceId || item.deviceId === deviceId || item.deviceCode === deviceCode)) return undefined;

    const now = new Date().toISOString();
    device = {
      id: deviceId,
      deviceId,
      deviceCode,
      deviceName: payload.deviceName || payload.name || deviceId,
      deviceType,
      connectionType: payload.connectionType || 'lan',
      ipAddress: payload.ipAddress || payload.ip || null,
      location: payload.location || null,
      gateId: payload.gateId ? String(payload.gateId).trim() : null,
      direction: normalizeDirection(payload.direction),
      cameraIds: [],
      cameraRole: deviceType === 'camera' ? (payload.cameraRole ? String(payload.cameraRole).trim() : 'lpr') : null,
      printerIds: [],
      printerRole: deviceType === 'printer' ? (payload.printerRole ? String(payload.printerRole).trim() : 'receipt') : null,
      allowedIps: normalizeAllowedIps(payload.allowedIps),
      status: 'active',
      isOnline: false,
      note: payload.note || `Provisioned ${deviceType} by admin`,
      deviceTokenHash: hashToken(deviceToken),
      deviceTokenIssuedAt: now,
      activatedAt: now,
      lastSeen: null,
    };
    return withSummary({ ...config, devices: [...devices, device] });
  });
  if (!device) return { ok: false, reason: 'duplicate' };

  appEvents.emit('device_event', toDeviceEvent('device_provisioned', device, { status: device.status, isOnline: device.isOnline }));
  emitDevicesConfigUpdated(saved);
  return { ok: true, device: toSafeDevice(device), deviceToken };
}

// Function ลงทะเบียนเครื่อง EDC (ไม่มี device token เพราะเครื่อง EDC ไม่ได้เรียก API) terminalId ห้ามซ้ำ
async function provisionEdcDevice(payload: DevicePayload = {}): Promise<ProvisionEdcResult> {
  let result = { ok: false, reason: 'duplicate' } as ProvisionEdcResult;
  const saved = await configRepository.updateConfig('devices', (config) => {
    const devices = Array.isArray(config.devices) ? config.devices : [];
    const terminalId = String(payload.terminalId || '').trim();
    if (!terminalId) {
      result = { ok: false, reason: 'terminal_id_required' };
      return undefined;
    }
    if (devices.some((device) => device.deviceType === 'edc' && device.terminalId === terminalId)) {
      result = { ok: false, reason: 'terminal_id_exists' };
      return undefined;
    }
    const deviceId = payload.deviceCode || generateDeviceId(devices, 'edc');
    if (devices.some((device) => device.id === deviceId || device.deviceId === deviceId || device.deviceCode === deviceId)) {
      result = { ok: false, reason: 'duplicate' };
      return undefined;
    }

    const device: DeviceRecord = {
      id: deviceId,
      deviceId,
      deviceCode: deviceId,
      deviceName: payload.deviceName || payload.name || deviceId,
      deviceType: 'edc',
      terminalId,
      merchantId: payload.merchantId || null,
      provider: payload.provider || null,
      serialNo: payload.serialNo || null,
      location: payload.location || null,
      usage: payload.usage === 'cashier' ? 'cashier' : 'device',
      status: 'active',
      isOnline: false,
      note: payload.note || 'EDC terminal',
    };
    result = { ok: true, device };
    return withSummary({ ...config, devices: [...devices, device] });
  });
  if (!result.ok) return result;

  appEvents.emit('device_event', toDeviceEvent('device_provisioned', result.device, { status: result.device.status, isOnline: false }));
  emitDevicesConfigUpdated(saved);
  return { ok: true, device: toSafeDevice(result.device) };
}

// Function ดึงเครื่อง EDC ที่ผูกกับ Kiosk/Barrier Gate คืน { ok, edc, reason } (reason: not_configured / unavailable)
async function resolveDeviceEdc(device: Pick<DeviceRecord, 'edcDeviceId'> | null | undefined): Promise<EdcLookupResult<'not_configured' | 'unavailable'>> {
  if (!device?.edcDeviceId) return { ok: false, reason: 'not_configured' };
  const edc = findEdc((await getDevicesConfig()).devices, device.edcDeviceId);
  if (!edc || edc.status !== 'active') return { ok: false, reason: 'unavailable', edc: toSafeDevice(edc) };
  return { ok: true, edc: toSafeDevice(edc) };
}

// Function ดึงเครื่อง EDC ของเคาน์เตอร์ที่ใช้ได้ (usage cashier และ active)
async function listCashierEdcDevices(): Promise<SafeDevice[]> {
  return (await getDevicesConfig()).devices
    .filter((device) => device.deviceType === 'edc' && device.usage === 'cashier' && device.status === 'active')
    .map((device) => toSafeDevice(device));
}

// Function ดึงเครื่อง EDC ของเคาน์เตอร์ตาม id คืน { ok, edc, reason } (reason: not_found / not_cashier / unavailable)
async function getCashierEdc(edcDeviceId: string | null | undefined): Promise<EdcLookupResult<'not_found' | 'not_cashier' | 'unavailable'>> {
  const edc = findEdc((await getDevicesConfig()).devices, edcDeviceId);
  if (!edc) return { ok: false, reason: 'not_found' };
  if (edc.usage !== 'cashier') return { ok: false, reason: 'not_cashier' };
  if (edc.status !== 'active') return { ok: false, reason: 'unavailable' };
  return { ok: true, edc: toSafeDevice(edc) };
}

// Function ดึงเครื่อง EDC ทั้งหมด (ใช้ประกอบรายงานกระทบยอด)
async function listEdcDevices(): Promise<SafeDevice[]> {
  return (await getDevicesConfig()).devices.filter((device) => device.deviceType === 'edc').map((device) => toSafeDevice(device));
}

// Function ออก activation code ใหม่ให้ kiosk/barrier gate เดิม และยกเลิก token เก่า
async function reissueActivationCode(id: string): Promise<ReissueResult> {
  let result = { ok: false, reason: 'not_found' } as ReissueResult;
  let reissued = null as DeviceRecord | null;
  const saved = await configRepository.updateConfig('devices', (config) => {
    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = findDeviceIndex(devices, id);
    if (index === -1) {
      result = { ok: false, reason: 'not_found' };
      return undefined;
    }

    const current = devices[index]!;
    if (!isActivationCodeDevice(current)) {
      result = { ok: false, reason: 'invalid_type', device: toSafeDevice(current) };
      return undefined;
    }
    if (current.status === 'maintenance') {
      result = { ok: false, reason: 'maintenance', device: toSafeDevice(current) };
      return undefined;
    }

    const activationCode = createActivationCode(devices, index);
    const activationExpiresAt = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();
    devices[index] = {
      ...current,
      activationCode,
      activationExpiresAt,
      deviceTokenHash: null,
      deviceTokenIssuedAt: null,
      isOnline: false,
      status: current.status === 'offline' ? 'offline' : 'active',
    };
    reissued = devices[index]!;
    result = { ok: true, activationCode, expiresAt: activationExpiresAt, device: toSafeDevice(reissued) };
    return withSummary({ ...config, devices });
  });
  if (!result.ok || !reissued) return result;

  appEvents.emit('device_event', toDeviceEvent('device_activation_reissued', result.device, {
    status: result.device.status,
    isOnline: result.device.isOnline,
    activationExpiresAt: result.expiresAt,
  }));
  emitDevicesConfigUpdated(saved);
  return result;
}

// Function เปิดใช้งาน kiosk/barrier gate ด้วย activation code คืน device และ token ใหม่ หรือ null ถ้า code ใช้ไม่ได้
async function activateDeviceByCode(code: unknown): Promise<{ device: SafeDevice; deviceToken: string } | null> {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) return null;

  const deviceToken = createDeviceToken();
  let activatedDevice = null as DeviceRecord | null;
  const saved = await configRepository.updateConfig('devices', (config) => {
    activatedDevice = null;
    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = devices.findIndex((device) => (
      isActivationCodeDevice(device) &&
      ACTIVATABLE_STATUSES.includes(device.status) &&
      String(device.activationCode || '').trim() === normalizedCode
    ));
    if (index === -1 || isExpired(devices[index]!.activationExpiresAt)) return undefined;

    const current = devices[index]!;
    const now = new Date().toISOString();
    activatedDevice = {
      ...current,
      deviceId: current.id,
      activationCode: null,
      activationExpiresAt: null,
      cameraIds: normalizeDeviceIds(current.cameraIds),
      printerIds: normalizeDeviceIds(current.printerIds),
      status: 'active',
      isOnline: true,
      deviceTokenHash: hashToken(deviceToken),
      deviceTokenIssuedAt: now,
      activatedAt: now,
      lastSeen: now,
    };
    devices[index] = activatedDevice;
    return withSummary({ ...config, devices });
  });
  if (!activatedDevice) return null;

  appEvents.emit('device_event', toDeviceEvent('device_activated', activatedDevice, {
    status: activatedDevice.status,
    isOnline: activatedDevice.isOnline,
    lastSeen: activatedDevice.lastSeen,
  }));
  emitDevicesConfigUpdated(saved);
  return { device: toSafeDevice(activatedDevice), deviceToken };
}

// Function ตรวจ deviceId + deviceToken และประเภทอุปกรณ์ที่อนุญาต
async function verifyRegisteredDeviceToken(deviceId: string | null | undefined, token: string | null | undefined, allowedTypes: string[] = []): Promise<DeviceTokenResult> {
  const device = await getRegisteredDevice(deviceId);
  if (!device) return { ok: false, reason: 'not_found' };
  if (allowedTypes.length && !allowedTypes.includes(device.deviceType)) return { ok: false, reason: 'invalid_type', device };
  if (!['active', 'offline', 'maintenance'].includes(device.status)) return { ok: false, reason: 'inactive', device };
  if (!device.deviceTokenHash || !token || !timingSafeStringEqual(hashToken(token), device.deviceTokenHash)) {
    return { ok: false, reason: 'invalid_token', device };
  }

  return { ok: true, device: toSafeDevice(device) };
}

// Function บันทึก heartbeat ของอุปกรณ์ ทำให้กลับมา online และอัปเดตข้อมูลที่ส่งมา
async function updateRegisteredDeviceHeartbeat(deviceId: string, details: HeartbeatDetails = {}): Promise<{ device: SafeDevice } | null> {
  let previous = null as DeviceRecord | null;
  let updatedDevice = null as DeviceRecord | null;
  const saved = await configRepository.updateConfig('devices', (config) => {
    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = devices.findIndex((device) => device.deviceId === deviceId || device.id === deviceId);
    if (index === -1) return undefined;

    const current = devices[index]!;
    previous = current;
    updatedDevice = {
      ...current,
      ipAddress: details.ip || details.ipAddress || current.ipAddress || null,
      location: details.location || current.location,
      deviceName: details.name || current.deviceName,
      status: current.status === 'maintenance' ? 'maintenance' : 'active',
      isOnline: current.status === 'maintenance' ? current.isOnline : true,
      lastSeen: new Date().toISOString(),
    };
    devices[index] = updatedDevice;
    return withSummary({ ...config, devices });
  });
  if (!updatedDevice || !previous) return null;

  if (!previous.isOnline || previous.status === 'offline') {
    appEvents.emit('device_event', toDeviceEvent('device_status_changed', updatedDevice, {
      previousStatus: previous.status,
      status: updatedDevice.status,
      isOnline: updatedDevice.isOnline,
      lastSeen: updatedDevice.lastSeen,
    }));
  }
  emitDevicesConfigUpdated(saved);
  return { device: toSafeDevice(updatedDevice) };
}

// Function แก้ไขข้อมูลและ mapping ของอุปกรณ์ด้วย id, deviceId หรือ deviceCode (เปลี่ยน deviceType ไม่ได้ เพราะ token ผูกกับประเภทเดิม)
async function updateDevice(id: string, body: DevicePayload = {}): Promise<UpdateDeviceResult> {
  let result = null as UpdateDeviceResult;
  const saved = await configRepository.updateConfig('devices', (config) => {
    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = findDeviceIndex(devices, id);
    if (index === -1) {
      result = null;
      return undefined;
    }
    if (body.deviceType !== undefined && body.deviceType !== devices[index]!.deviceType) {
      result = { ok: false, reason: 'device_type_immutable' };
      return undefined;
    }

    const allowedFields: (keyof DevicePayload)[] = ['deviceCode', 'deviceName', 'connectionType', 'ipAddress', 'location', 'gateId', 'direction', 'cameraIds', 'cameraRole', 'printerIds', 'printerRole', 'edcDeviceId', 'allowedIps', 'status', 'isOnline', 'note', ...EDC_ONLY_FIELDS];
    const patch: Record<string, unknown> = {};
    allowedFields.forEach((field) => {
      if (field in body) patch[field] = body[field];
    });
    if ('name' in body && !('deviceName' in patch)) patch.deviceName = body.name;
    if ('ip' in body && !('ipAddress' in patch)) patch.ipAddress = body.ip;
    if ('direction' in patch) patch.direction = normalizeDirection(patch.direction);
    if ('cameraIds' in patch) patch.cameraIds = normalizeDeviceIds(patch.cameraIds);
    if ('printerIds' in patch) patch.printerIds = normalizeDeviceIds(patch.printerIds);
    if ('allowedIps' in patch) patch.allowedIps = normalizeAllowedIps(patch.allowedIps);
    if ('status' in patch && !('isOnline' in patch)) patch.isOnline = patch.status === 'active';

    const current = devices[index]!;
    const fail = (reason: string): undefined => {
      result = { ok: false, reason };
      return undefined;
    };
    if (current.deviceType === 'edc') {
      // เครื่อง EDC ไม่มี heartbeat จึงไม่มีสถานะ online
      delete patch.edcDeviceId;
      if ('isOnline' in patch) patch.isOnline = false;
      if ('terminalId' in patch) {
        patch.terminalId = String(patch.terminalId || '').trim();
        if (!patch.terminalId) return fail('terminal_id_required');
        if (devices.some((device) => device.deviceType === 'edc' && device.id !== current.id && device.terminalId === patch.terminalId)) return fail('terminal_id_exists');
      }
      // EDC ที่ Kiosk/Barrier Gate ผูกอยู่ เปลี่ยนเป็นเครื่องของเคาน์เตอร์ไม่ได้จนกว่าจะยกเลิกการผูก
      if (patch.usage === 'cashier' && devices.some((device) => device.edcDeviceId === current.deviceId)) return fail('edc_in_use');
    } else {
      EDC_ONLY_FIELDS.forEach((field) => delete patch[field]);
      const mappingError = getDeviceMappingError(devices, { cameraIds: patch.cameraIds, printerIds: patch.printerIds });
      if (mappingError) {
        result = { ok: false, reason: 'invalid_device_mapping', details: mappingError };
        return undefined;
      }
      // ย้ายกล้องไป gate ใหม่ต้องเอาออกจาก gate เดิมก่อน กันกล้องตัวเดียวเปิดไม้กั้นหลาย gate
      const cameraConflict = getCameraAssignmentConflict(devices, patch.cameraIds, current.id);
      if (cameraConflict) {
        result = { ok: false, reason: 'camera_in_use', details: cameraConflict };
        return undefined;
      }
      if ('edcDeviceId' in patch) {
        const edcDeviceId = patch.edcDeviceId ? String(patch.edcDeviceId) : null;
        if (edcDeviceId && !EDC_OWNER_DEVICE_TYPES.has(current.deviceType)) return fail('edc_owner_invalid');
        const edcError = getEdcBindingError(devices, edcDeviceId, current.id);
        if (edcError) return fail(edcError);
        patch.edcDeviceId = findEdc(devices, edcDeviceId)?.deviceId || null;
      }
    }

    const updated: DeviceRecord = { ...current, ...patch };
    devices[index] = updated;
    result = { ok: true, device: toSafeDevice(updated) };
    return withSummary({ ...config, devices });
  });
  if (result?.ok) emitDevicesConfigUpdated(saved);
  return result;
}

// Function ผูกหรือถอดกล้อง/printer ทีละตัวกับ Kiosk/Barrier Gate (คำนวณรายการใหม่ใน lock ของ config จึงไม่ทับการแก้ตัวอื่นที่เกิดพร้อมกัน)
// ผูกซ้ำหรือถอดตัวที่ไม่ได้ผูกถือว่าสำเร็จ, ถอดไม่ตรวจว่าอุปกรณ์ยังมีอยู่ (ใช้ล้าง id เก่าที่ค้างได้)
async function changeDeviceMapping(id: string, { field, deviceId, action }: { field: DeviceMappingError['field']; deviceId: string; action: 'add' | 'remove' }): Promise<UpdateDeviceResult> {
  let result = null as UpdateDeviceResult;
  const saved = await configRepository.updateConfig('devices', (config) => {
    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = findDeviceIndex(devices, id);
    if (index === -1) {
      result = null;
      return undefined;
    }
    const current = devices[index]!;
    if (!MAPPING_OWNER_DEVICE_TYPES[field].has(current.deviceType)) {
      result = { ok: false, reason: 'mapping_owner_invalid' };
      return undefined;
    }

    const currentIds = normalizeDeviceIds(current[field]);
    const peripheralId = String(deviceId || '').trim();
    if (action === 'add') {
      const mappingError = getDeviceMappingError(devices, { [field]: [peripheralId] });
      if (mappingError) {
        result = { ok: false, reason: 'invalid_device_mapping', details: mappingError };
        return undefined;
      }
      const cameraConflict = field === 'cameraIds' ? getCameraAssignmentConflict(devices, [peripheralId], current.id) : null;
      if (cameraConflict) {
        result = { ok: false, reason: 'camera_in_use', details: cameraConflict };
        return undefined;
      }
    }
    const nextIds = action === 'add' ? normalizeDeviceIds([...currentIds, peripheralId]) : currentIds.filter((value) => value !== peripheralId);
    result = { ok: true, device: toSafeDevice({ ...current, [field]: nextIds }) };
    if (nextIds.length === currentIds.length && nextIds.every((value, position) => value === currentIds[position])) return undefined;

    devices[index] = { ...current, [field]: nextIds };
    return withSummary({ ...config, devices });
  });
  if (result?.ok) emitDevicesConfigUpdated(saved);
  return result;
}

// Function ลบอุปกรณ์ด้วย id, deviceId หรือ deviceCode และเอา id ของอุปกรณ์นี้ออกจาก cameraIds/printerIds/edcDeviceId ของอุปกรณ์อื่น
async function deleteDevice(id: string): Promise<{ device: SafeDevice } | null> {
  let device = null as DeviceRecord | null;
  const saved = await configRepository.updateConfig('devices', (config) => {
    device = null;
    const devices = [...(Array.isArray(config.devices) ? config.devices : [])];
    const index = findDeviceIndex(devices, id);
    if (index === -1) return undefined;

    const [removed] = devices.splice(index, 1);
    device = removed!;
    const removedIds = new Set([removed!.id, removed!.deviceId].filter((value): value is string => Boolean(value)));
    const unmapped = devices.map((item) => ({
      ...item,
      ...(Array.isArray(item.cameraIds) ? { cameraIds: item.cameraIds.filter((value) => !removedIds.has(value)) } : {}),
      ...(Array.isArray(item.printerIds) ? { printerIds: item.printerIds.filter((value) => !removedIds.has(value)) } : {}),
      ...(item.edcDeviceId && removedIds.has(item.edcDeviceId) ? { edcDeviceId: null } : {}),
    }));
    return withSummary({ ...config, devices: unmapped });
  });
  if (!device) return null;

  appEvents.emit('device_event', toDeviceEvent('device_deleted', device, { status: 'deleted', isOnline: false }));
  emitDevicesConfigUpdated(saved);
  return { device: toSafeDevice(device) };
}

// Function ตรวจว่ากล้องเป็นอุปกรณ์ที่ provision แล้วและ map กับ Barrier Gate ของ gate/direction ที่ส่งมา
async function validateCameraGateBinding({ cameraId, gateId, direction }: { cameraId?: unknown; gateId?: unknown; direction?: unknown } = {}): Promise<CameraGateBindingResult> {
  const normalizedCameraId = String(cameraId || '').trim();
  if (!normalizedCameraId) {
    return { ok: false, statusCode: 400, reason: 'cameraId_required', message: 'cameraId is required' };
  }

  const config = await getDevicesConfig();
  const camera = config.devices.find((device) => device.deviceId === normalizedCameraId || device.id === normalizedCameraId);
  if (!camera || camera.deviceType !== 'camera') {
    return { ok: false, statusCode: 400, reason: 'camera_not_registered', message: 'cameraId is not a provisioned camera device' };
  }
  if (!['active', 'offline'].includes(camera.status)) {
    return { ok: false, statusCode: 403, reason: 'camera_inactive', message: 'Camera device is not active' };
  }

  const normalizedGateId = gateId ? String(gateId).trim() : null;
  const normalizedDirection = normalizeDirection(direction);
  const barrierGate = config.devices.find((device) => {
    if (device.deviceType !== 'barrier_gate' || !device.deviceId) return false;
    if (!normalizeDeviceIds(device.cameraIds).includes(normalizedCameraId)) return false;
    if (normalizedGateId && device.gateId && device.gateId !== normalizedGateId) return false;
    if (normalizedDirection && device.direction && device.direction !== normalizedDirection) return false;
    return true;
  });
  if (!barrierGate) {
    return { ok: false, statusCode: 400, reason: 'camera_gate_mismatch', message: 'cameraId is not mapped to the requested gate/direction' };
  }

  return { ok: true, camera: toSafeDevice(camera), barrierGate: toSafeDevice(barrierGate) };
}

export { activateDeviceByCode, changeDeviceMapping, createActivationDevice, deleteDevice, getCashierEdc, getDevicesConfigWithMeta, getRegisteredDevice, listCashierEdcDevices, listEdcDevices, provisionCredentialedDevice, provisionEdcDevice, refreshDeviceRuntimeState, reissueActivationCode, resolveDeviceEdc, startDeviceRuntimeMonitor, toSafeConfig, updateDevice, updateRegisteredDeviceHeartbeat, validateCameraGateBinding, verifyRegisteredDeviceToken };
