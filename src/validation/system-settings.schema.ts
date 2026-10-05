// Import Library
import { z } from 'zod';
// Import Validation
import { configObject, nullableString, positiveNumber } from './zod';

/* -------------------------------------- Config -------------------------------------- */

// Config ช่วงเวลาที่ให้ออกจากลานหลังจ่ายเงิน (นาที) ที่รองรับ
const PAYMENT_EXIT_WINDOW_RANGE = { min: 1, max: 1440 };

/* -------------------------------------- Formats -------------------------------------- */

// Format เวลาออกจากลานหลังจ่ายเงินเป็นนาทีจำนวนเต็มในช่วงที่รองรับ (รับ string ตัวเลขจาก form ได้)
function exitWindowMinutes(field: string) {
  const { min, max } = PAYMENT_EXIT_WINDOW_RANGE;
  const message = `${field} must be an integer between ${min} and ${max}`;
  return z.union([z.number(), z.string().trim().regex(/^\d+$/, { error: message })], { error: message })
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max, { error: message })
    .transform(Number);
}

/* -------------------------------------- System Settings Schemas -------------------------------------- */

// Schema body สำหรับตั้งค่า printer ของใบเสร็จ
const printerSettingsBodySchema = configObject('printer', {
  fontSize: positiveNumber('fontSize').optional(),
  billNumberFontSize: positiveNumber('billNumberFontSize').optional(),
  paperWidth: positiveNumber('paperWidth').optional(),
});

// Schema body สำหรับตั้งค่าใบเสร็จ (expiryDuration คือนาทีที่ต้องออกหลังจ่ายเงิน)
const receiptSettingsBodySchema = configObject('receipt', {
  entryBill: configObject('entryBill').optional(),
  paymentBill: configObject('paymentBill', {
    expiryDuration: exitWindowMinutes('paymentBill.expiryDuration').optional(),
  }).optional(),
  printer: printerSettingsBodySchema.optional(),
  paperWidth: z.union([z.string(), z.number()], { error: 'paperWidth must be a string or number' }).optional(),
  footerText: nullableString('footerText'),
});

// Schema body สำหรับตั้งค่าระบบทั้งหมด
const systemSettingsBodySchema = configObject('body', {
  general: configObject('general', {
    systemName: nullableString('general.systemName'),
    location: nullableString('general.location'),
    language: nullableString('general.language'),
    timezone: nullableString('general.timezone'),
    frontendUrl: nullableString('general.frontendUrl'),
  }).optional(),
  receipt: receiptSettingsBodySchema.optional(),
  billing: configObject('billing').optional(),
});

export { PAYMENT_EXIT_WINDOW_RANGE, systemSettingsBodySchema };
