// Import Library
import type omiseFactory from 'omise';
// Import Types
import type { PaymentChannelSetting, PaymentMethodSetting } from './config.type';
import type { ProcessPaymentResult } from './transaction.type';

/* -------------------------------------- Payment Gateway Types -------------------------------------- */

// Type เอกสาร (รูป QR) ของ Omise
export interface OmiseDocumentData {
  download_uri?: string | null;
  location?: string | null;
  uri?: string | null;
}

// Type Omise charge เฉพาะ field ที่ระบบใช้ (เก็บใน payment_gateway_charges.raw)
export interface OmiseChargeData {
  id: string;
  object?: string;
  amount?: number;
  currency?: string;
  status?: string;
  paid?: boolean;
  paid_at?: string | null;
  paidAt?: string | null;
  failure_code?: string | null;
  authorize_uri?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: { scannable_code?: { image?: OmiseDocumentData | null } | null; [key: string]: unknown } | null;
  refunds?: { data?: { id: string }[] } | null;
  [key: string]: unknown;
}

// Type เหตุผลที่ต้องคืนเงินจาก gateway
export type RefundReason = 'already_paid' | 'transaction_not_payable' | 'transaction_not_found' | 'overpaid';

// Type gateway charge ในรูปแบบ API
export interface GatewayChargeApi {
  id: string;
  provider: string;
  chargeId: string;
  transactionId: string;
  plateNo: string;
  amount: number;
  currency: string;
  method: string;
  channel: string;
  status: string;
  paidAt: string | null;
  processedAt: string | null;
  raw: OmiseChargeData | null;
  refundAmount: number | null;
  refundReason: string | null;
  refundResolvedAt: string | null;
  refundNote: string | null;
  refundResolvedBy: string | null;
  refundMethod: string | null;
  refundId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// Type gateway charge ที่ส่งผ่าน realtime (ไม่มี raw)
export type GatewayChargeEvent = Omit<GatewayChargeApi, 'raw'>;

// Type ข้อมูลที่ใช้สร้าง gateway charge record
export interface GatewayChargeInput {
  provider?: string;
  chargeId: string;
  transactionId: string;
  plateNo: string;
  amount: number;
  currency: string;
  method: string;
  channel: string;
  status?: string;
  raw?: OmiseChargeData | null;
}

// Type ข้อมูลที่แก้ไขได้ของ gateway charge
export interface GatewayChargeUpdate {
  status?: string;
  raw?: OmiseChargeData;
  paidAt?: string | null;
  processedAt?: string | null;
  refundAmount?: number;
  refundReason?: string;
  refundResolvedAt?: string | null;
  refundNote?: string | null;
  refundResolvedBy?: string | null;
  refundMethod?: string | null;
  refundId?: string | null;
}

// Type รายการรอคืนเงินที่ส่งให้ Admin
export interface RefundItem {
  chargeId: string;
  transactionId: string;
  plateNo: string;
  method: string;
  channel: string;
  amount: number;
  refundAmount: number | null;
  refundReason: string | null;
  paidAt: string | null;
  refundMethod: string | null;
}

// Type วิธีชำระที่ใช้ได้ของช่องทางหนึ่ง
export interface AvailablePaymentMethod {
  id: string;
  label: string;
  icon: string | null;
}

/* -------------------------------------- Charges Repository Types -------------------------------------- */

// Type ข้อมูลผู้บันทึกการคืนเงิน
export interface RefundActorInput {
  refundNote?: string | null;
  refundResolvedBy?: string | null;
}

/* -------------------------------------- Omise Types -------------------------------------- */

// Type ไฟล์ที่ดาวน์โหลดจาก Omise document endpoint
export interface OmiseDocumentFile {
  contentType: string;
  body: Buffer;
}

// Type ข้อมูลที่ใช้สร้าง Omise charge (amount เป็นบาท)
export interface CreateChargeInput {
  amount: number;
  source?: string | OmiseSourceInput | null;
  token?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
  returnUri?: string | null;
  expiresAt?: string | null;
}

// Type source ที่ backend สร้างเอง (เช่น { type: 'promptpay' })
export interface OmiseSourceInput {
  type: string;
  [key: string]: unknown;
}

// Type Omise event ที่ส่งมาทาง webhook
export interface OmiseWebhookEvent {
  data?: { id?: string; object?: string; [key: string]: unknown } | null;
  charge?: string;
  chargeId?: string;
  [key: string]: unknown;
}

// Type error ที่ Omise SDK โยนออกมา
export interface OmiseErrorLike {
  message?: string;
  object?: string;
  code?: string;
  location?: string;
  toString?: () => string;
}

// Type Omise client
export type OmiseClient = ReturnType<typeof omiseFactory>;

/* -------------------------------------- Omise Payment Types -------------------------------------- */

// Type response ของการสร้าง Omise charge (amount เป็นสตางค์)
export interface OmiseChargeResponse {
  provider: 'omise';
  reused: boolean;
  chargeId: string;
  status: string;
  amount: number;
  currency: string;
  plateNo: string;
  method: string;
  channel: string;
  authorizeUri: string | null;
  expiresAt: string | null;
  transaction: {
    plateNo: string;
    status: string;
    remainingAmount: number;
    exitTimeLimit: string | null;
  };
  qr: unknown;
}

// Type ข้อมูลที่ client ส่งมาเพื่อสร้าง charge
export interface ClientChargeInput {
  plateNo?: string;
  source?: string | null;
  token?: string | null;
  sourceType?: string | null;
  method?: string | null;
  channel?: string;
  processedBy?: string | null;
  returnUri?: string | null;
}

// Type ข้อมูลที่ Admin ส่งมาเพื่อสร้าง charge
export interface AdminChargeInput extends Omit<ClientChargeInput, 'channel'> {
  transactionId?: string | null;
  channel?: string;
  amount?: unknown;
}

// Type ผลการประมวลผล charge ที่จ่ายสำเร็จหรือ webhook
export interface GatewayProcessResult {
  action: 'processed' | 'refund_required' | 'already_processed' | 'updated' | 'pending' | 'ignored';
  chargeId?: string;
  status?: string;
  reason?: string;
  object?: string;
  refundAmount?: number;
  refundReason?: RefundReason;
  transaction?: ProcessPaymentResult;
}

// Type charge ที่ยังรอจ่ายพร้อมเวลาหมดอายุ
export type ActiveGatewayCharge = GatewayChargeApi & { expiresAt: string };

// Type ข้อมูลผู้บันทึกการคืนเงิน
export interface RefundActionInput {
  note?: string | null;
  resolvedBy?: string | null;
}

/* -------------------------------------- Payment Selection Types -------------------------------------- */

// Type method/channel ที่ผ่านการตรวจ
export interface PaymentSelection {
  ok: true;
  method: PaymentMethodSetting;
  channel: PaymentChannelSetting;
}

// Type ผลตรวจ method/channel
export type PaymentSelectionResult = PaymentSelection | { ok: false; message: string };

/* -------------------------------------- Payment Realtime Types -------------------------------------- */

// Type event payment_updated ที่ส่งให้ client ผ่าน WebSocket
export interface PaymentUpdateEvent {
  type: 'payment_updated';
  provider: string;
  chargeId: string;
  plateNo: string;
  transactionId: string;
  paymentStatus: string;
  transactionStatus: string | null;
  remainingAmount: number | null;
  exitTimeLimit: string | null;
  applied?: boolean;
  refundRequired: boolean;
  refundAmount: number | null;
  refundReason: string | null;
  gatewayCharge: GatewayChargeEvent | null;
  replayed?: boolean;
  emittedAt: string;
}
