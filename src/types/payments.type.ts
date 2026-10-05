// Import Types
import type { SafeDevice } from './shared/device.type';

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

// Type รายงานกระทบยอด EDC
export interface EdcReconciliation {
  range: { startDate: string; endDate: string };
  total: { count: number; amount: number };
  missingReferenceCount: number;
  terminals: EdcReconciliationTerminal[];
}

// Type query ของรายงานกระทบยอด EDC
export interface ReconciliationQuery {
  date?: string;
  start_date?: string;
  end_date?: string;
}
