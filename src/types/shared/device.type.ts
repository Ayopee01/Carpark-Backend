/* -------------------------------------- Device Types -------------------------------------- */

// Type ประเภทอุปกรณ์ที่ระบบรู้จัก
export type DeviceType = 'kiosk' | 'barrier_gate' | 'camera' | 'printer' | 'edc';

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
  status: string;
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

// Type event ของอุปกรณ์ที่ส่งให้ Admin SSE
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
export type ReissueResult = { ok: true; activationCode: string; expiresAt: string; device: SafeDevice } | DeviceFailure<'not_found' | 'invalid_type' | 'maintenance'>;

// Type ผลการแก้ไขอุปกรณ์ (null = ไม่พบ)
export type UpdateDeviceResult = { ok: true; device: SafeDevice } | DeviceFailure | null;

// Type ผลตรวจกล้องกับ Barrier Gate
export type CameraGateBindingResult =
  | { ok: true; camera: SafeDevice; barrierGate: SafeDevice }
  | { ok: false; statusCode: number; reason: string; message: string };
