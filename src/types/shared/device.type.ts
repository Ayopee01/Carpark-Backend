/* -------------------------------------- Device Types -------------------------------------- */

// Type ประเภทอุปกรณ์ที่ระบบรู้จัก
export type DeviceType = 'kiosk' | 'barrier_gate' | 'camera' | 'printer' | 'edc';

// Type สถานะอุปกรณ์ (pending_activation/offline ระบบตั้งเอง, Admin ตั้งได้แค่ active/maintenance/inactive)
export type DeviceStatus = 'pending_activation' | 'active' | 'offline' | 'maintenance' | 'inactive';

// Type การใช้งานเครื่อง EDC (cashier = เคาน์เตอร์ Admin, device = ผูกกับ Kiosk/Barrier Gate)
export type EdcUsage = 'cashier' | 'device';

// Type อุปกรณ์หนึ่งเครื่องที่เก็บใน app_config key devices
export interface DeviceRecord {
  id: string;
  deviceId: string | null;
  deviceCode: string;
  deviceName: string;
  deviceType: DeviceType | string;
  connectionType?: string;
  ipAddress?: string | null;
  location?: string | null;
  gateId?: string | null;
  direction?: string | null;
  cameraIds?: string[];
  cameraRole?: string | null;
  printerIds?: string[];
  printerRole?: string | null;
  edcDeviceId?: string | null;
  allowedIps?: string[];
  terminalId?: string;
  merchantId?: string | null;
  provider?: string | null;
  serialNo?: string | null;
  usage?: EdcUsage;
  status: DeviceStatus;
  isOnline: boolean;
  note?: string;
  activationCode?: string | null;
  activationExpiresAt?: string | null;
  deviceTokenHash?: string | null;
  deviceTokenIssuedAt?: string | null;
  activatedAt?: string;
  lastSeen?: string | null;
}

// Type อุปกรณ์ที่ตัด token hash ออกแล้ว (ส่งออก API/event ได้)
export type SafeDevice = Omit<DeviceRecord, 'deviceTokenHash'>;

// Type devices config ที่เก็บใน app_config key devices
export interface DevicesConfig {
  summary?: { totalDevices: number; online: number; offline: number };
  devices: DeviceRecord[];
  masterData?: Record<string, unknown>;
}

// Type event ของอุปกรณ์ที่ส่งให้ Socket.IO /admin
export interface DeviceEvent {
  type: string;
  deviceId: string | null;
  id: string;
  deviceCode: string;
  deviceType: string;
  deviceName: string;
  [key: string]: unknown;
}

// Type ผลตรวจ device token
export type DeviceTokenResult =
  | { ok: true; device: SafeDevice }
  | { ok: false; reason: 'not_found' | 'invalid_type' | 'inactive' | 'invalid_token'; device?: DeviceRecord };

// Type ผลการหาเครื่อง EDC
export type EdcLookupResult<TReason extends string> = { ok: true; edc: SafeDevice } | { ok: false; reason: TReason; edc?: SafeDevice | null };

/* -------------------------------------- Device API Types -------------------------------------- */

// Type field ที่อุปกรณ์ทุกประเภทส่งออก API (ทุก key มีเสมอ ค่าที่ไม่มีเป็น null)
export interface DeviceApiBase {
  id: string;
  deviceId: string | null;
  deviceCode: string | null;
  deviceName: string;
  location: string | null;
  status: DeviceStatus;
  isOnline: boolean;
  note: string | null;
}

// Type field ของอุปกรณ์ที่ต่อเครือข่ายและส่ง heartbeat (kiosk, barrier gate, camera, printer)
export interface NetworkDeviceApiFields {
  connectionType: string | null;
  ipAddress: string | null;
  lastSeen: string | null;
  activatedAt: string | null;
  allowedIps: string[];
  gateId: string | null;
  direction: 'IN' | 'OUT' | null;
  cameraRole: string | null;
  printerRole: string | null;
}

// Type kiosk/barrier gate ที่ API ส่งออก (deviceId เป็น null จนกว่าจะ activate)
export interface ActivationDeviceApi extends DeviceApiBase, NetworkDeviceApiFields {
  deviceType: 'kiosk' | 'barrier_gate';
  activationCode: string | null;
  activationExpiresAt: string | null;
  cameraIds: string[];
  printerIds: string[];
  edcDeviceId: string | null;
}

// Type camera/printer ที่ API ส่งออก (provision แล้วมี deviceId เสมอ ไม่มี mapping ของตัวเอง)
export interface PeripheralDeviceApi extends DeviceApiBase, NetworkDeviceApiFields {
  deviceType: 'camera' | 'printer';
  deviceId: string;
}

// Type เครื่อง EDC ที่ API ส่งออก (ไม่มี heartbeat จึง isOnline เป็น false เสมอ)
export interface EdcDeviceApi extends DeviceApiBase {
  deviceType: 'edc';
  deviceId: string;
  terminalId: string;
  merchantId: string | null;
  provider: string | null;
  serialNo: string | null;
  usage: EdcUsage;
}

// Type อุปกรณ์ที่ API และ Socket.IO ส่งออก แยกด้วย deviceType
export type DeviceApi = ActivationDeviceApi | PeripheralDeviceApi | EdcDeviceApi;

// Type payload ของ devices_config_updated (devices เป็นรูปแบบ API)
export type DevicesConfigEvent = Omit<DevicesConfig, 'devices'> & { summary: { totalDevices: number; online: number; offline: number }; devices: DeviceApi[]; configUpdatedAt?: string | null };

/* -------------------------------------- Device Registry Types -------------------------------------- */

// Type ข้อมูลอุปกรณ์ที่ Admin ส่งมาตอนสร้าง/provision/แก้ไข (รับชื่อ field สำรอง name/ip ได้)
export interface DevicePayload {
  deviceId?: string | null;
  deviceCode?: string | null;
  deviceName?: string | null;
  name?: string | null;
  deviceType?: string | null;
  connectionType?: string | null;
  ipAddress?: string | null;
  ip?: string | null;
  location?: string | null;
  gateId?: string | null;
  direction?: string | null;
  cameraIds?: unknown;
  cameraRole?: string | null;
  printerIds?: unknown;
  printerRole?: string | null;
  edcDeviceId?: string | null;
  allowedIps?: unknown;
  terminalId?: string | null;
  merchantId?: string | null;
  provider?: string | null;
  serialNo?: string | null;
  usage?: string | null;
  status?: string | null;
  isOnline?: boolean;
  note?: string | null;
}

// Type แจ้งเตือน Admin เรื่อง IP ของอุปกรณ์ (device_ip_changed = IP เปลี่ยน, device_ip_blocked = token ถูกแต่ IP ไม่อยู่ใน allowedIps)
export interface DeviceAlertEvent {
  type: 'device_ip_changed' | 'device_ip_blocked';
  deviceId: string | null;
  deviceName: string;
  deviceType: string;
  ip: string;
  previousIp: string | null;
  at: string;
}

// Type ข้อมูลที่อุปกรณ์ส่งมากับ heartbeat
export interface HeartbeatDetails {
  ip?: string | null;
  ipAddress?: string | null;
  location?: string | null;
  name?: string | null;
}

// Type ผลล้มเหลวของการแก้ไข devices config (details ส่งต่อไปใน error response)
export interface DeviceFailure<TReason extends string = string> {
  ok: false;
  reason: TReason;
  device?: SafeDevice | null;
  details?: DeviceMappingError | CameraAssignmentConflict;
}

// Type กล้องที่ผูกกับอุปกรณ์อื่นอยู่แล้ว (กล้อง 1 ตัวผูกได้กับ Barrier Gate เดียว) deviceId คืออุปกรณ์ที่ผูกอยู่
export interface CameraAssignmentConflict {
  field: 'cameraIds';
  cameraIds: string[];
  assignedTo: { cameraId: string; deviceId: string }[];
}

// Type id ใน cameraIds/printerIds ที่ไม่ใช่กล้อง/printer ที่ลงทะเบียนไว้
export interface DeviceMappingError {
  field: 'cameraIds' | 'printerIds';
  invalidIds: string[];
}

// Type ผลการสร้างอุปกรณ์ที่ใช้ activation code
export type CreateActivationResult = { ok: true; device: SafeDevice; activationCode: string; activationExpiresAt: string } | DeviceFailure;

// Type ผลการ provision camera/printer
export type ProvisionResult = { ok: true; device: SafeDevice; deviceToken: string } | DeviceFailure<'duplicate'>;

// Type ผลการลงทะเบียน EDC
export type ProvisionEdcResult = { ok: true; device: SafeDevice } | DeviceFailure<'duplicate' | 'terminal_id_required' | 'terminal_id_exists'>;

// Type ผลการออก activation code ใหม่
export type ReissueResult = { ok: true; activationCode: string; expiresAt: string; device: SafeDevice } | DeviceFailure<'not_found' | 'invalid_type' | 'maintenance' | 'inactive'>;

// Type ผลการแก้ไขอุปกรณ์ (null = ไม่พบ)
export type UpdateDeviceResult = { ok: true; device: SafeDevice } | DeviceFailure | null;

// Type ผลตรวจกล้องกับ Barrier Gate
export type CameraGateBindingResult =
  | { ok: true; camera: SafeDevice; barrierGate: SafeDevice }
  | { ok: false; statusCode: number; reason: string; message: string };
