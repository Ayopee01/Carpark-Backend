// Import Library
import { z } from 'zod';
// Import Validation
import { configObject, nullableString, positiveNumber } from './zod';

/* -------------------------------------- Config -------------------------------------- */

// Config ช่วงเวลาที่ให้ออกจากลานหลังจ่ายเงิน (นาที) ที่รองรับ
const PAYMENT_EXIT_WINDOW_RANGE = { min: 1, max: 1440 };

// Config ภาษาที่หน้าจอรองรับ
const LANGUAGES = ['th', 'en'] as const;

/* -------------------------------------- Formats -------------------------------------- */

// Format เวลาออกจากลานหลังจ่ายเงินเป็นนาทีจำนวนเต็มในช่วงที่รองรับ (รับ string ตัวเลขจาก form ได้)
function exitWindowMinutes(field: string) {
  const { min, max } = PAYMENT_EXIT_WINDOW_RANGE;
  const message = `${field} must be an integer between ${min} and ${max}`;
  return z.union([z.number(), z.string().trim().regex(/^\d+$/, { error: message })], { error: message })
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max, { error: message })
    .transform(Number);
}

// Format ขนาดของ printer เป็นตัวเลขที่มากกว่า 0 (รับ string ตัวเลขจาก form แล้วเก็บเป็น number)
function printerSize(field: string) {
  return positiveNumber(field).transform(Number).optional();
}

// Format ตัวเลือกแสดงข้อมูลบนใบเสร็จเป็น boolean
function receiptToggle(field: string) {
  return z.boolean({ error: `${field} must be a boolean` }).optional();
}

/* -------------------------------------- System Settings Schemas -------------------------------------- */

// Schema body สำหรับตั้งค่า printer ของใบเสร็จ (paperWidth เป็นมิลลิเมตร)
const printerSettingsBodySchema = configObject('printer', {
  fontSize: printerSize('fontSize'),
  billNumberFontSize: printerSize('billNumberFontSize'),
  paperWidth: printerSize('paperWidth'),
});

// Schema body สำหรับตั้งค่าใบเสร็จ (expiryDuration คือนาทีที่ต้องออกหลังจ่ายเงิน)
const receiptSettingsBodySchema = configObject('receipt', {
  entryBill: configObject('entryBill', {
    showDate: receiptToggle('entryBill.showDate'),
    showEntryTime: receiptToggle('entryBill.showEntryTime'),
    showQrCode: receiptToggle('entryBill.showQrCode'),
    showBillNo: receiptToggle('entryBill.showBillNo'),
  }).optional(),
  paymentBill: configObject('paymentBill', {
    showDate: receiptToggle('paymentBill.showDate'),
    showEntryTime: receiptToggle('paymentBill.showEntryTime'),
    showQrCode: receiptToggle('paymentBill.showQrCode'),
    showBillNo: receiptToggle('paymentBill.showBillNo'),
    showExpiryTime: receiptToggle('paymentBill.showExpiryTime'),
    expiryDuration: exitWindowMinutes('paymentBill.expiryDuration').optional(),
  }).optional(),
  printer: printerSettingsBodySchema.optional(),
  footerText: nullableString('footerText'),
});

// Schema body สำหรับตั้งค่าระบบทั้งหมด
const systemSettingsBodySchema = configObject('body', {
  general: configObject('general', {
    systemName: nullableString('general.systemName'),
    location: nullableString('general.location'),
    language: z.enum(LANGUAGES, { error: `general.language must be one of ${LANGUAGES.join(', ')}` }).optional(),
    // backend คิดวันและเวลาเป็นเวลาไทยเสมอ จึงรับได้ค่าเดียว
    timezone: z.literal('Asia/Bangkok', { error: 'general.timezone must be Asia/Bangkok' }).optional(),
    frontendUrl: nullableString('general.frontendUrl'),
  }).optional(),
  receipt: receiptSettingsBodySchema.optional(),
  billing: configObject('billing', {
    taxEnabled: z.boolean({ error: 'billing.taxEnabled must be a boolean' }).optional(),
    // เงินเป็นบาทและปัดเศษปกติ 2 ตำแหน่ง (roundMoney) เท่านั้น
    currency: z.literal('THB', { error: 'billing.currency must be THB' }).optional(),
    roundingMode: z.literal('normal', { error: 'billing.roundingMode must be normal' }).optional(),
  }).optional(),
});

export { PAYMENT_EXIT_WINDOW_RANGE, systemSettingsBodySchema };
