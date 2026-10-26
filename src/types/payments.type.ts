// Import Types
import type { SafeDevice } from './shared/device.type';
import type { EdcVerificationStatus } from './shared/payment.type';

/* -------------------------------------- Admin Payment Types -------------------------------------- */

// Type รายการรับบัตรผ่าน EDC ในรายงานกระทบยอด
export interface EdcReconciliationPayment {
  transactionId: string;
  plateNo: string;
  billNo: string;
  paymentId: string;
  reference: string | null;
  terminalId: string | null;
  edcDeviceId: string | null;
  edcVerification: EdcVerificationStatus | null;
  amount: number;
  paidAt: string;
  channel: string;
  deviceId: string | null;
  processedBy: string | null;
}

// Type สรุปรายการรับบัตรของเครื่อง EDC หนึ่งเครื่อง
export interface EdcReconciliationTerminal {
  terminalId: string | null;
  edcDevice: Pick<SafeDevice, 'deviceId' | 'deviceName' | 'location' | 'provider' | 'usage'> | null;
  channels: string[];
  deviceIds: string[];
  count: number;
  amount: number;
  payments: EdcReconciliationPayment[];
}

// Type สรุปรายการรับบัตรของเครื่อง EDC หนึ่งเครื่องแบบไม่มีรายการทีละรายการ
export type EdcReconciliationTerminalSummary = Omit<EdcReconciliationTerminal, 'payments'>;

// Type สรุปกระทบยอด EDC ของช่วงวันที่ (ยอดเป็นบาท)
export interface EdcReconciliationSummary {
  total: { count: number; amount: number };
  missingReferenceCount: number;
  unverifiedCount: number;
  terminals: EdcReconciliationTerminal[];
}
