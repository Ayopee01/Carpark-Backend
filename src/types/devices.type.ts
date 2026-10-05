/* -------------------------------------- Devices Types -------------------------------------- */

// Type อุปกรณ์ใน response หลังสร้าง/แก้ไข (ไม่มี token และ activation code)
export interface DeviceMutationResponse {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  connectionType: string | undefined;
  location: string | null;
  ipAddress: string | null;
  gateId: string | null;
  direction: string | null;
  cameraIds: string[];
  cameraRole: string | null;
  printerIds: string[];
  printerRole: string | null;
  edcDeviceId: string | null;
  terminalId: string | null;
  merchantId: string | null;
  provider: string | null;
  serialNo: string | null;
  usage: string | null;
  allowedIps: string[];
  status: string;
  isOnline: boolean;
  note: string;
}

// Type สรุปจำนวนอุปกรณ์ตามสถานะ
export interface DeviceCounts {
  total: number;
  online: number;
  offline: number;
  maintenance: number;
}

// Type error ที่ map จากเหตุผลของ device registry
export type ErrorSpec = [number, string, string];
