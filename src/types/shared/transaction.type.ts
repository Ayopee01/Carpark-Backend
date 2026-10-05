// Import Library
import type { Transaction } from '@prisma/client';
// Import Types
import type { PricingConfig, PricingRule, SystemSettings } from './config.type';
// Import Utils
import type { VEHICLE_TYPES } from '../../utils/vehicle';

/* -------------------------------------- Transaction Types -------------------------------------- */

// Type สถานะของ transaction
export type TransactionStatus = 'pending' | 'partially_paid' | 'paid_waiting_exit' | 'completed' | 'cancelled';

// Type ช่องทางการชำระที่ใช้ในรายงานและ payment
export type PaymentChannelCode = 'cashier' | 'kiosk' | 'gate' | 'mobile';

// Type แหล่งที่มาของการชำระเงิน
export type PaymentSource = 'kiosk' | 'barrier_gate' | 'mobile' | 'admin';

// Type payment หนึ่งรายการที่เก็บใน transactions.payments (JSON)
export interface PaymentRecord {
  id: string;
  method: string;
  channel: string;
  source?: PaymentSource;
  sourceContext?: Record<string, unknown>;
  paidAmount: number;
  amount?: number;
  paidAt: string;
  expiryAt?: string;
  processedBy?: string;
  reference?: string;
  terminalId?: string;
  edcDeviceId?: string;
  deviceId?: string;
  deviceType?: string;
  deviceName?: string;
  deviceLocation?: string;
  [key: string]: unknown;
}

// Type ข้อมูลกล้องที่เก็บใน transactions.receipt.camera
export interface CameraReceipt {
  cameraId: string;
  gateId: string | null;
  direction: string;
  capturedAt: string;
  imageUrl?: string;
}

// Type ข้อมูลใน transactions.receipt (JSON)
export interface TransactionReceipt {
  camera?: CameraReceipt;
  closedReason?: string;
  [key: string]: unknown;
}

// Type ช่วงชั่วโมงที่คิดเงินในหนึ่งวัน
export interface FeeRange {
  feeType: string | null;
  ruleId: string | null;
  hourStart: number;
  hourEnd: number;
  hours: number;
  pricePerHour: number;
  amount: number;
}

// Type รายละเอียดค่าจอดแยกรายวันและค่าค้างคืน
export interface FeeBreakdown {
  days: { date: string; hours: number; amount: number; ranges: FeeRange[] }[];
  overnight: { ruleId: string | null; nights: number; pricePerNight: number; amount: number } | null;
}

// Type ผลการคำนวณค่าจอด
export interface FeeResult {
  totalHours: number;
  totalAmount: number;
  durationMs: number;
  nights: number;
  breakdown: FeeBreakdown;
}

// Type transaction ในรูปแบบ API (ค่าจอดคำนวณ ณ ตอนที่เรียก)
export interface TransactionApi {
  id: string;
  billNo: string;
  plateNo: string;
  vehicleType: string;
  entryAt: string | null;
  exitAt: string | null;
  calculatedAt: string;
  exitTimeLimit: string | null;
  isOverstay: boolean;
  status: TransactionStatus | string;
  baseAmount: number;
  netAmount: number;
  totalPaid: number;
  remainingAmount: number;
  serviceDisplay: string;
  durationHour: number;
  totalMinutes: number;
  feeBreakdown: FeeBreakdown;
  payments: PaymentRecord[];
  qrData: string;
  createdAt: string | null;
  updatedAt: string | null;
}

// Type ตัวเลือกทะเบียนเมื่อค้นหาเจอหลายคัน
export interface PlateCandidate {
  plateNo: string;
  billNo: string;
  vehicleType: string;
  status: string;
  entryAt: string | null;
  exitAt: string | null;
  exitTimeLimit: string | null;
}

// Type ผลค้นหา transaction จากทะเบียน
export type PlateLookupResult =
  | { matchType: 'invalid'; message: string }
  | { matchType: 'not_found' }
  | { matchType: 'single'; transaction: TransactionApi | null }
  | { matchType: 'multiple'; requiresSelection: true; query: string; candidates: PlateCandidate[] };

// Type ข้อมูลที่ใช้สร้าง transaction จาก event กล้อง
export interface CameraTransactionDto {
  plateNo: string;
  vehicleType: VehicleType;
  cameraId: string;
  gateId: string | null;
  direction: string;
  capturedAt: Date;
  imageUrl?: string;
}

// Type action ของ gate/camera integration
export type GateAction = 'OPEN_GATE' | 'PAYMENT_REQUIRED' | 'TRANSACTION_NOT_FOUND' | 'IGNORE_DUPLICATE' | 'IGNORE_ACTIVE_TRANSACTION';

// Type response มาตรฐานของ gate/camera integration
export interface GateResponseBody {
  success: boolean;
  action: GateAction;
  message: string;
  openGate: boolean;
  data: {
    transactionId: string | null;
    plateNo: string;
    direction: string | undefined;
    status: string;
    openGate: boolean;
    exitTimeLimit?: string | null;
    capturedAt?: string;
    checkedAt?: string;
    paymentRequired?: boolean;
    reason?: string | null;
    remainingAmount?: number | null;
    netAmount?: number | null;
    totalPaid?: number | null;
  };
}

// Type ผลของ event กล้องที่ส่งกลับ route
export interface GateResult {
  statusCode: number;
  body: GateResponseBody;
}

/* -------------------------------------- Vehicle Types -------------------------------------- */

// Type ประเภทรถที่ระบบคิดราคาได้
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/* -------------------------------------- Pricing Types -------------------------------------- */

// Type pricing rule เฉพาะ field ที่ใช้คำนวณค่าจอด (id/name ไม่บังคับ)
export type PricingRuleInput = Pick<PricingRule, 'feeType' | 'vehicleType' | 'price' | 'status'> & Partial<Pick<PricingRule, 'id' | 'hourStart' | 'hourEnd' | 'baseHours'>>;

/* -------------------------------------- Payment Report Types -------------------------------------- */

// Type transaction ที่มี payments (ใช้ได้ทั้ง record จาก database และรูปแบบ API)
export interface TransactionWithPayments {
  id: string;
  payments?: unknown;
}

// Type payment ที่แนบ transactionId ไว้สำหรับรายงาน
export type ReportPayment = PaymentRecord & { transactionId: string };

// Type ช่องทางที่ใช้แยกยอดในรายงาน
export type ReportChannel = 'cashier' | 'kiosk' | 'gate' | 'mobile';

// Type สรุปรายได้
export interface RevenueSummary {
  total: number;
  staff: number;
  scan: number;
  byChannel: Record<ReportChannel, { amount: number; count: number }>;
}

/* -------------------------------------- Payment Source Types -------------------------------------- */

// Type ข้อมูลอุปกรณ์ที่ส่งมากับการชำระเงิน (รับได้หลายชื่อ field)
export interface PaymentDeviceInput {
  deviceId?: string | null;
  id?: string | null;
  deviceType?: string | null;
  type?: string | null;
  deviceName?: string | null;
  name?: string | null;
  deviceLocation?: string | null;
  location?: string | null;
}

// Type ข้อมูลอุปกรณ์ที่บันทึกกับ payment
export interface PaymentDevice {
  deviceId?: string;
  deviceType?: PaymentSource;
  deviceName?: string;
  deviceLocation?: string;
}

// Type ข้อมูลที่ใช้หา source/channel ของการชำระเงิน
export interface PaymentSourceInput {
  source?: string | null;
  paymentSource?: string | null;
  routeType?: string | null;
  channel?: string | null;
  processedBy?: string | null;
  device?: PaymentDeviceInput | null;
  sourceContext?: unknown;
}

// Type ผลการหา source/channel ของการชำระเงิน
export interface ResolvedPaymentSource {
  source: PaymentSource;
  channel: string;
  sourceContext: Record<string, unknown>;
  device: PaymentDevice | null;
}

/* -------------------------------------- Transaction Repository Types -------------------------------------- */

// Type filter ของรายการ transaction
export interface TransactionFilters {
  keyword?: unknown;
  plateNo?: unknown;
  billNo?: unknown;
  status?: string | string[];
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

// Type เลขอ้างอิงการชำระ (เลขอนุมัติ EDC + เครื่อง)
export interface PaymentReferenceKey {
  reference: string;
  terminalId?: string | null;
}

// Type แถว payment ที่ใช้ทำรายงาน
export type PaymentRow = Pick<Transaction, 'id' | 'plateNo' | 'billNo' | 'payments'>;

/* -------------------------------------- Transaction Mapper Types -------------------------------------- */

// Type config ที่ใช้คำนวณค่าจอดและสร้าง qrData
export interface TransactionApiContext {
  pricingConfig?: Pick<PricingConfig, 'pricingRules'> | null;
  systemSettings?: Pick<SystemSettings, 'general'> | null;
}

// Type transaction record ที่ใช้สร้างตัวเลือกทะเบียน
export type PlateCandidateRow = Pick<Transaction, 'plateNo' | 'billNo' | 'vehicleType' | 'status' | 'entryAt' | 'exitAt' | 'exitTimeLimit'>;

/* -------------------------------------- Transaction Lookup Types -------------------------------------- */

// Type input ของรายการ transaction แบบแบ่งหน้า
export interface ListTransactionsInput extends TransactionFilters {
  all?: boolean;
  page?: number | string;
  perPage?: number | string;
}

/* -------------------------------------- Transaction Payment Types -------------------------------------- */

// Type ข้อมูลการชำระเงินที่ส่งให้ processPayment
export interface ProcessPaymentInput extends PaymentSourceInput {
  plateNo?: string | null;
  method?: string | null;
  amount?: unknown;
  reference?: string | null;
  terminalId?: string | null;
  edcDeviceId?: string | null;
  gatewayCollected?: boolean;
}

// Type ผลการชำระเงิน (duplicatePayment เมื่อ reference เดิมถูกบันทึกแล้ว)
export type ProcessPaymentResult = TransactionApi & { duplicatePayment?: true };
