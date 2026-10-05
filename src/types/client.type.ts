// Import Types
import type { SafeDevice } from './shared/device.type';
import type { FeeBreakdown } from './shared/transaction.type';

/* -------------------------------------- Client Types -------------------------------------- */

// Type ประเภท client ที่เรียก API
export type ClientType = 'mobile' | 'kiosk' | 'barrier_gate';

// Type ข้อมูลอุปกรณ์ที่ใส่ใน response ฝั่ง client
export interface ClientDevice {
  deviceId: string | null;
  deviceType: string;
  deviceName: string;
  deviceLocation: string | null | undefined;
  status: string;
}

// Type ที่มาของ request ฝั่ง client
export interface ClientSource {
  clientType: ClientType;
  device: ClientDevice | null;
}

// Type ข้อมูล request ที่ route ส่งมา (device ที่ยืนยันตัวตนแล้ว และ IP)
export interface ClientRequestContext {
  device?: SafeDevice | null;
  ip?: string | null;
}

// Type input ของ endpoint ชำระเงินฝั่ง client
export interface ClientPaymentInput {
  body?: Record<string, unknown> | null;
  deviceId?: string | null;
  context?: ClientRequestContext;
}

// Type query ที่มี deviceId
export interface ClientQuery {
  deviceId?: string;
  plateNo?: unknown;
  chargeId?: string;
}

// Type transaction ในรูปแบบ response ฝั่ง client
export interface ClientTransactionResponse {
  transactionId: string;
  billNo: string;
  plateNo: string;
  vehicleType: string;
  entryAt: string | null;
  calculatedAt: string;
  exitTimeLimit: string | null;
  isOverstay: boolean;
  status: string;
  amount: { netAmount: number; paidAmount: number; remainingAmount: number };
  duration: { display: string; hours: number; totalMinutes: number };
  feeBreakdown: FeeBreakdown;
  qrData: string;
  clientType: ClientType;
  device: ClientDevice | null;
}

// Type response หลังเปิดใช้งานอุปกรณ์
export interface ActivateDeviceResponse {
  success: true;
  message: string;
  deviceToken: string;
  deviceId: string | null;
  deviceType: string;
  deviceName: string;
  location: string | null | undefined;
  gateId?: string | null;
  direction?: string | null;
  cameraIds?: string[];
  printerIds?: string[];
  status: string;
}
