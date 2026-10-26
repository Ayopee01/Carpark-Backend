// Import Library
import { z } from 'zod';
// Import Validation
import { mustBeEmpty, nonEmptyString, nullableString, optionalHttpUrl, requiredText } from './zod';

/* -------------------------------------- Rules -------------------------------------- */

// Rule ของ source ที่ส่งให้ Omise: ไม่มี source ต้องเป็น promptpay (backend สร้าง source เอง) และมี source ต้องระบุ method หรือ sourceType
function checkChargeSource(body: Record<string, unknown>, ctx: z.RefinementCtx<Record<string, unknown>>): void {
  const method = String(body.method || '').trim();
  const sourceType = String(body.sourceType || '').trim();
  if (!body.source && (sourceType || method).toLowerCase() !== 'promptpay') {
    ctx.addIssue({ code: 'custom', message: 'source is required unless method is promptpay', path: ['source'] });
  } else if (!method && !sourceType) {
    ctx.addIssue({ code: 'custom', message: 'method or sourceType is required', path: ['method'] });
  }
}

/* -------------------------------------- Omise Charge Schemas -------------------------------------- */

// Schema input ของ Omise charge จาก mobile/kiosk/barrier gate (field อื่นส่งต่อตามเดิม)
const clientOmiseChargeInputSchema = z.looseObject({
  plateNo: requiredText('plateNo is required'),
  // บัตรรับผ่านเครื่อง EDC (แตะบัตร) เท่านั้น จึงไม่รับ card token ที่กรอกบัตรผ่าน Omise.js
  token: mustBeEmpty('Card payments must use the EDC terminal, card tokens are not accepted'),
  returnUri: optionalHttpUrl('returnUri must be an http or https URL'),
}).superRefine(checkChargeSource);

// Schema input ของ Omise charge จาก Admin (channel cashier เท่านั้น, amount เป็นสตางค์ที่ต้องตรงกับยอดค้าง)
const adminOmiseChargeInputSchema = z.looseObject({
  // Admin รับบัตรด้วยเครื่อง EDC เท่านั้น จึงไม่รับ card token (กันการกรอกบัตรลูกค้าแทนผ่าน API)
  token: mustBeEmpty('Admin card payments must use the EDC terminal, card tokens are not accepted'),
  channel: z.unknown().refine((channel) => channel === undefined || channel === 'cashier', { error: 'Admin Omise payment channel must be cashier' }).optional(),
  returnUri: optionalHttpUrl('returnUri must be an http or https URL'),
  amount: z.unknown().refine((amount) => amount === undefined || amount === null || amount === '' || (Number.isFinite(Number(amount)) && Number(amount) > 0), { error: 'amount is invalid' }).optional(),
}).superRefine(checkChargeSource)
  .refine((input) => input.transactionId || input.plateNo, { error: 'transactionId or plateNo is required', path: ['transactionId'] });

// Schema input ที่ต้องมี chargeId (รูป QR ของ client, จำลองการจ่าย)
const chargeIdInputSchema = z.looseObject({
  chargeId: requiredText('chargeId is required'),
});

// Schema input รูป QR ของ Admin ต้องมี chargeId หรือ documentPath
const adminQrImageInputSchema = z.object({
  chargeId: z.string().nullish(),
  documentPath: z.string().nullish(),
}).refine((input) => input.chargeId || input.documentPath, { error: 'chargeId or documentPath is required', path: ['chargeId'] });

/* -------------------------------------- Admin Payment Schemas -------------------------------------- */

// Schema body สำหรับบันทึกว่าคืนเงินของ gateway charge แล้ว
const resolveRefundBodySchema = z.object({
  note: nullableString('note'),
});

// Schema body สำหรับขอ ticket ต่อ Admin payment WebSocket
const socketTicketBodySchema = z.object({
  chargeId: nonEmptyString('chargeId').max(100, 'chargeId must be at most 100 characters'),
});

/* -------------------------------------- Error Codes -------------------------------------- */

// Config error code ของแต่ละ field (คง code เดิมที่ frontend ใช้)
const PAYMENT_ERROR_CODES = {
  clientCharge: { plateNo: 'PLATE_NO_REQUIRED', token: 'CARD_TOKEN_NOT_SUPPORTED', returnUri: 'INVALID_RETURN_URI', source: 'SOURCE_REQUIRED', method: 'PAYMENT_METHOD_REQUIRED' },
  adminCharge: { token: 'ADMIN_CARD_NOT_SUPPORTED', channel: 'ADMIN_CHANNEL_MUST_BE_CASHIER', returnUri: 'INVALID_RETURN_URI', amount: 'INVALID_AMOUNT', source: 'SOURCE_REQUIRED', method: 'PAYMENT_METHOD_REQUIRED', transactionId: 'TRANSACTION_ID_OR_PLATE_NO_REQUIRED' },
  chargeId: { chargeId: 'CHARGE_ID_REQUIRED' },
  adminQrImage: { chargeId: 'CHARGE_ID_OR_DOCUMENT_PATH_REQUIRED' },
};

export { PAYMENT_ERROR_CODES, adminOmiseChargeInputSchema, adminQrImageInputSchema, chargeIdInputSchema, clientOmiseChargeInputSchema, resolveRefundBodySchema, socketTicketBodySchema };
