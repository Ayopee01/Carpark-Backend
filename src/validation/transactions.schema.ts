// Import Library
import { z } from 'zod';
// Import Validation
import { moneyAmount, nonEmptyString, nullableString, positiveNumber } from './zod';
// Import Utils
import { parseBangkokDateTime } from '../utils/date';
import { VEHICLE_TYPES, isVehicleType } from '../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config สถานะ transaction ที่ระบบรู้จัก
const TRANSACTION_STATUSES = ['pending', 'partially_paid', 'paid_waiting_exit', 'completed', 'cancelled'] as const;

/* -------------------------------------- Formats -------------------------------------- */

// Format string ที่ห้ามว่าง (abort เพื่อไม่ตรวจเงื่อนไขถัดไปซ้ำ)
function requiredString(field: string) {
  return z.string({ error: `${field} is required` }).trim().min(1, { error: `${field} is required`, abort: true });
}

// Format ค่าที่ไม่บังคับ ผ่านเสมอเมื่อเป็น undefined/null
function optionalValue(check: (value: unknown) => boolean, message: string) {
  return z.unknown().refine((value) => value === undefined || value === null || check(value), { error: message }).optional();
}

/* -------------------------------------- Transaction Schemas -------------------------------------- */

// Schema body จากกล้อง LPR (ไม่ตัด field อื่น เพราะ gateId อ่านจาก payload เดิม)
const cameraTransactionBodySchema = z.looseObject({
  plateNo: requiredString('plateNo'),
  cameraId: requiredString('cameraId'),
  direction: requiredString('direction').refine((value) => ['IN', 'OUT'].includes(value.toUpperCase()), { error: 'direction must be IN or OUT' }),
  vehicleType: optionalValue((value) => isVehicleType(String(value).trim().toLowerCase()), 'vehicleType must be car or motorcycle'),
  capturedAt: optionalValue((value) => Boolean(parseBangkokDateTime(value)), 'capturedAt must be a valid date time'),
  imageUrl: optionalValue((value) => typeof value === 'string', 'imageUrl must be a string'),
});

// Format วันเวลาที่ไม่บังคับ (null คือล้างค่า) ต้อง parse ได้จริง ไม่แปลงค่าผิดเป็น null เงียบ ๆ
function optionalDateTime(field: string) {
  return z.unknown()
    .refine((value) => value === undefined || value === null || Boolean(parseBangkokDateTime(value)), { error: `${field} must be a valid date time` })
    .transform((value) => (value === undefined || value === null ? value : parseBangkokDateTime(value)))
    .optional();
}

// Schema body สำหรับ Admin แก้ไข transaction (ตัด field ที่ไม่รู้จักออก)
const updateTransactionBodySchema = z.object({
  plateNo: nonEmptyString('plateNo').optional(),
  vehicleType: z.enum(VEHICLE_TYPES, { error: `vehicleType must be one of ${VEHICLE_TYPES.join(', ')}` }).optional(),
  serviceType: nonEmptyString('serviceType').optional(),
  status: z.enum(TRANSACTION_STATUSES, { error: `status must be one of ${TRANSACTION_STATUSES.join(', ')}` }).optional(),
  totalPaid: moneyAmount('totalPaid').transform(Number).optional(),
  payments: z.array(z.looseObject({
    paidAmount: moneyAmount('payments.paidAmount').transform(Number),
    paidAt: z.string({ error: 'payments.paidAt must be a valid date time' }).refine((value) => Boolean(parseBangkokDateTime(value)), { error: 'payments.paidAt must be a valid date time' }),
  }), { error: 'payments must be an array' }).optional(),
  exitTimeLimit: optionalDateTime('exitTimeLimit'),
  exitAt: optionalDateTime('exitAt'),
});

// Config channel ที่ Admin ส่งมาได้ตอนรับชำระเงิน (ทุกค่าบันทึกเป็น cashier)
const ADMIN_PAYMENT_CHANNELS = ['cashier', 'admin', 'ch_cashier'];

// Schema body สำหรับ Admin รับชำระเงิน (amount ตรวจใน processPayment ด้วย requestedAmountInputSchema) บัตรต้องมี reference และเครื่อง EDC ของเคาน์เตอร์
const adminPaymentBodySchema = z.object({
  plateNo: nullableString('plateNo'),
  method: nonEmptyString('method').optional(),
  channel: nullableString('channel').refine((channel) => !channel || ADMIN_PAYMENT_CHANNELS.includes(channel.trim().toLowerCase()), { error: 'Admin payment channel must be cashier' }),
  amount: z.unknown().optional(),
  deviceId: nullableString('deviceId'),
  deviceName: nullableString('deviceName'),
  deviceLocation: nullableString('deviceLocation'),
  reference: z.string({ error: 'reference must be a string' }).trim().max(100, 'reference must be at most 100 characters').nullable().optional(),
  edcDeviceId: z.string({ error: 'edcDeviceId must be a string' }).trim().max(50, 'edcDeviceId must be at most 50 characters').nullable().optional(),
  confirmPendingCharge: z.boolean({ error: 'confirmPendingCharge must be a boolean' }).optional(),
}).superRefine((body, ctx) => {
  if (body.method !== 'card') return;
  if (!body.reference) ctx.addIssue({ code: 'custom', message: 'reference (EDC approval code) is required for card payments', path: ['reference'] });
  else if (!body.edcDeviceId) ctx.addIssue({ code: 'custom', message: 'edcDeviceId is required for card payments', path: ['edcDeviceId'] });
});

// Schema amount ที่ขอจ่าย (number หรือ string ตัวเลขที่มากกว่า 0)
const requestedAmountInputSchema = z.object({
  amount: positiveNumber('amount'),
});

// Schema body สำหรับ Kiosk/Barrier Gate บันทึกการรับบัตรผ่านเครื่อง EDC หลังเครื่องอนุมัติแล้ว
const clientEdcPaymentBodySchema = z.object({
  transactionId: nonEmptyString('transactionId').optional(),
  plateNo: nonEmptyString('plateNo').optional(),
  amount: z.unknown()
    .refine((value) => value !== undefined && value !== null, { error: 'amount is required', abort: true })
    .pipe(moneyAmount('amount'))
    .refine((value) => Number(value) > 0, { error: 'amount must be a number greater than 0' }),
  reference: z.string({ error: 'reference is required' }).trim().min(1, 'reference is required').max(100, 'reference must be at most 100 characters'),
  terminalId: z.string({ error: 'terminalId is required' }).trim().min(1, 'terminalId is required').max(50, 'terminalId must be at most 50 characters'),
}).refine((body) => body.transactionId || body.plateNo, { error: 'transactionId or plateNo is required', path: ['transactionId'] });

/* -------------------------------------- Error Codes -------------------------------------- */

// Config error code ของแต่ละ field (คง code เดิมที่ frontend ใช้)
const TRANSACTION_ERROR_CODES = {
  adminPayment: { channel: 'ADMIN_CHANNEL_MUST_BE_CASHIER', reference: 'PAYMENT_REFERENCE_REQUIRED', edcDeviceId: 'EDC_DEVICE_REQUIRED' },
  requestedAmount: { amount: 'INVALID_AMOUNT' },
};

export { TRANSACTION_ERROR_CODES, TRANSACTION_STATUSES, adminPaymentBodySchema, cameraTransactionBodySchema, clientEdcPaymentBodySchema, requestedAmountInputSchema, updateTransactionBodySchema };
