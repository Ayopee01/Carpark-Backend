// Import Library
import { z } from 'zod';
// Import Utils
import { parseBangkokDateTime } from '../utils/date';
import { isIpOrCidr } from '../utils/ip';
import { hasMoneyPrecision } from '../utils/money';
import { FEE_TYPES, HOURS_PER_DAY } from '../utils/parking-fee';
import { VEHICLE_TYPES, isVehicleType } from '../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config regex ตัวเลขที่รับจาก form เช่น "30" หรือ "12.5"
const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

// Config ข้อความเดียวกันทุกกรณี เพื่อไม่บอกว่า field ไหนผิด
const LOGIN_REQUIRED = 'username and password are required';

// Config role ของสมาชิก (สิทธิ์จริงอยู่ที่ permissions ส่วน role ใช้แสดงผลและกฎ super_admin)
const MEMBER_ROLES = ['super_admin', 'staff'] as const;

// Config สถานะของสมาชิก (inactive = login ไม่ได้และ session เดิมถูกตัด)
const MEMBER_STATUSES = ['active', 'inactive'] as const;

// Config สถานะ transaction ที่ระบบรู้จัก
const TRANSACTION_STATUSES = ['pending', 'partially_paid', 'paid_waiting_exit', 'completed', 'cancelled'] as const;

// Config ประเภทอุปกรณ์ที่ระบบรู้จัก
const DEVICE_TYPES = ['kiosk', 'barrier_gate', 'camera', 'printer', 'edc'];

// Config สถานะที่ Admin ตั้งเองได้ (pending_activation และ offline ระบบตั้งตาม activation/heartbeat)
const ADMIN_DEVICE_STATUSES = ['active', 'maintenance', 'inactive'] as const;

// Config ข้อความ error ของ direction
const DIRECTION_MESSAGE = 'direction must be IN or OUT';

// Config สถานะของ pricing rule (inactive = ไม่ใช้คิดเงินและไม่ถูกตรวจช่วงชั่วโมง)
const PRICING_RULE_STATUSES = ['active', 'inactive'] as const;

// Config theme ที่ frontend รองรับ ('' = ยังไม่เลือก, custom = ใช้สีจาก themeColor/customThemeColor)
const THEME_MODES = ['', 'theme1', 'theme2', 'theme3', 'custom'] as const;

// Config ช่วงเวลาที่ให้ออกจากลานหลังจ่ายเงิน (นาที) ที่รองรับ
const PAYMENT_EXIT_WINDOW_RANGE = { min: 1, max: 1440 };

// Config ภาษาที่หน้าจอรองรับ
const LANGUAGES = ['th', 'en'] as const;

/* -------------------------------------- Formats -------------------------------------- */

// Format ตัวเลขตามเงื่อนไข รับทั้ง number และ string ตัวเลข (service เป็นคนแปลงเป็น number ต่อ)
function numberFormat(message: string, check: (value: number) => boolean) {
  return z
    .union([z.number(), z.string().trim().regex(NUMERIC_STRING, { error: message })], { error: message })
    .refine((value) => Number.isFinite(Number(value)) && check(Number(value)), { error: message });
}

// Format จำนวนเงินที่ไม่ติดลบและมีทศนิยมไม่เกิน 2 ตำแหน่ง
function moneyAmount(field: string) {
  return numberFormat(`${field} must be a number greater than or equal to 0 with at most 2 decimals`, (value) => value >= 0 && hasMoneyPrecision(value));
}

// Format ตัวเลขที่มากกว่า 0
function positiveNumber(field: string) {
  return numberFormat(`${field} must be a number greater than 0`, (value) => value > 0);
}

// Format string ที่ไม่บังคับ รองรับ null สำหรับล้างค่า
function nullableString(field: string) {
  return z.string({ error: `${field} must be a string` }).nullable().optional();
}

// Format string ที่ไม่บังคับแต่ห้ามเป็นค่าว่างถ้าส่งมา
function nonEmptyString(field: string) {
  return z.string({ error: `${field} must be a string` }).trim().min(1, `${field} must not be empty`);
}

// Format array ของ string
function stringArray(field: string) {
  return z.array(z.string({ error: `${field} must contain only strings` }), { error: `${field} must be an array` });
}

// Format object ที่เก็บ field อื่นไว้ด้วย ใช้กับ config JSON ที่ frontend อาจส่ง field เพิ่ม
function configObject<TShape extends z.ZodRawShape>(field: string, shape: TShape = {} as TShape) {
  return z.looseObject(shape, { error: `${field} must be an object` });
}

// Format ข้อความที่บังคับส่ง แปลงค่าเป็น string และตัดช่องว่าง (ไม่ส่ง, null หรือว่างใช้ message เดียวกัน)
function requiredText(message: string) {
  return z.preprocess((value) => (value === undefined || value === null ? '' : String(value).trim()), z.string().min(1, message));
}

// Format field ที่ห้ามส่งมา (เช่น card token ที่ระบบไม่รับ) ค่าว่างถือว่าไม่ได้ส่ง
function mustBeEmpty(message: string) {
  return z.unknown().refine((value) => !value, { error: message }).optional();
}

// Format URL http/https ที่ไม่บังคับ (ไม่ส่ง, null หรือ '' ถือว่าไม่ได้ส่ง)
function optionalHttpUrl(message: string) {
  return z.unknown().refine((value) => {
    if (value === undefined || value === null || value === '') return true;
    return URL.canParse(String(value)) && ['http:', 'https:'].includes(new URL(String(value)).protocol);
  }, { error: message }).optional();
}

// Format ข้อความใน query string ที่ไม่บังคับ (ค่าที่ไม่ใช่ข้อความ เช่นส่ง key ซ้ำเป็น array ถือว่าไม่ได้ส่ง)
function queryText() {
  return z.string().trim().optional().catch(undefined);
}

// Format switch ใน query string เช่น ?all=true หรือ ?exact=1 (ไม่ส่งหรือค่าอื่นถือเป็น false)
function queryFlag() {
  return z.stringbool().catch(false);
}

// Format จำนวนเต็มบวกใน query string เช่น page/per_page (ไม่ส่งหรือค่าผิดใช้ fallback, ส่งเกิน max ใช้ max)
function queryPositiveInt(fallback: number, max = Number.MAX_SAFE_INTEGER) {
  return z.coerce.number().int().positive().catch(fallback).transform((value) => Math.min(value, max));
}

// Format string ที่ไม่บังคับ ตัดช่องว่าง และรองรับ null สำหรับล้างค่า
function optionalText(field: string) {
  return z.string({ error: `${field} must be a string` }).trim().nullable().optional();
}

// Format string ที่ห้ามว่าง (abort เพื่อไม่ตรวจเงื่อนไขถัดไปซ้ำ)
function requiredString(field: string) {
  return z.string({ error: `${field} is required` }).trim().min(1, { error: `${field} is required`, abort: true });
}

// Format ค่าที่ไม่บังคับ ผ่านเสมอเมื่อเป็น undefined/null
function optionalValue(check: (value: unknown) => boolean, message: string) {
  return z.unknown().refine((value) => value === undefined || value === null || check(value), { error: message }).optional();
}

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

// Format direction เป็น IN/OUT (ไม่สนตัวพิมพ์) หรือค่าว่างเพื่อไม่กำหนดทิศทาง
const directionFormat = z
  .string({ error: DIRECTION_MESSAGE })
  .refine((value) => ['', 'IN', 'OUT'].includes(value.trim().toUpperCase()), { error: DIRECTION_MESSAGE })
  .nullable()
  .optional();

// Format field ร่วมของอุปกรณ์ (service ใช้ allowlist อยู่แล้ว schema นี้ตรวจชนิดข้อมูล)
const deviceFields = {
  deviceName: z.string({ error: 'deviceName must be a string' }).trim().nullable().optional(),
  name: z.string({ error: 'name must be a string' }).trim().nullable().optional(),
  deviceCode: nullableString('deviceCode'),
  location: nullableString('location'),
  gateId: nullableString('gateId'),
  direction: directionFormat,
  cameraIds: stringArray('cameraIds').optional(),
  printerIds: stringArray('printerIds').optional(),
  connectionType: nullableString('connectionType'),
  ipAddress: nullableString('ipAddress'),
  ip: nullableString('ip'),
  cameraRole: nullableString('cameraRole'),
  printerRole: nullableString('printerRole'),
  status: z.enum(ADMIN_DEVICE_STATUSES, { error: `status must be one of ${ADMIN_DEVICE_STATUSES.join(', ')}` }).optional(),
  isOnline: z.boolean({ error: 'isOnline must be a boolean' }).optional(),
  note: nullableString('note'),
  edcDeviceId: nullableString('edcDeviceId'),
  terminalId: nullableString('terminalId'),
  merchantId: nullableString('merchantId'),
  provider: nullableString('provider'),
  serialNo: nullableString('serialNo'),
  usage: z.enum(['cashier', 'device'], { error: 'usage must be cashier or device' }).optional(),
  // ตรวจราย index ให้ error ชี้ช่องที่ผิด (field allowedIps.<index>) รับ IP เดี่ยวหรือช่วง CIDR เช่น 203.0.113.0/28
  allowedIps: z.array(
    z.string({ error: 'allowedIps must contain only strings' }).refine((ip) => isIpOrCidr(ip), { error: 'allowedIps must contain only IP addresses' }),
    { error: 'allowedIps must be an array' },
  ).optional(),
};

// Format ชื่ออุปกรณ์ตอนแก้ไข ถ้าส่งมาต้องไม่ว่างหลังตัดช่องว่าง (null หรือ "" ล้างชื่อไม่ได้)
function deviceNameUpdate(field: string) {
  return z.string({ error: `${field} must be a string` }).trim().min(1, 'deviceName is required').optional();
}

// Function ตรวจว่ามี deviceName หรือ name อย่างใดอย่างหนึ่งที่ไม่ว่างหลังตัดช่องว่าง
function hasDeviceName(body: { deviceName?: string | null; name?: string | null }): boolean {
  return Boolean(body.deviceName?.trim() || body.name?.trim());
}

// Format ชั่วโมงของวันเป็นจำนวนเต็ม 1-24 (รับ string ตัวเลขจาก form ได้)
function hourNumber(field: string) {
  const message = `${field} must be an integer between 1 and ${HOURS_PER_DAY}`;
  return z.union([z.number(), z.string().trim().regex(/^\d+$/, { error: message })], { error: message })
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= HOURS_PER_DAY, { error: message });
}

// Format field ของ pricing rule
const pricingRuleFields = {
  id: z.string({ error: 'id must be a string' }).optional(),
  name: nullableString('name'),
  feeType: z.enum(FEE_TYPES, { error: `feeType must be one of ${FEE_TYPES.join(', ')}` }).optional(),
  vehicleType: z.enum(VEHICLE_TYPES, { error: `vehicleType must be one of ${VEHICLE_TYPES.join(', ')}` }).optional(),
  price: moneyAmount('price').optional(),
  baseHours: hourNumber('baseHours').optional(),
  hourStart: hourNumber('hourStart').optional(),
  hourEnd: hourNumber('hourEnd').nullable().optional(),
  status: z.enum(PRICING_RULE_STATUSES, { error: `status must be one of ${PRICING_RULE_STATUSES.join(', ')}` }).optional(),
};

// Format สี HEX แบบ #RRGGBB หรือ null เพื่อล้างค่า
function hexColor(field: string) {
  return z.string({ error: `${field} must be a string` }).regex(/^#[0-9A-Fa-f]{6}$/, { error: `${field} must be a hex color like #1A2B3C` }).nullable().optional();
}

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

/* -------------------------------------- Auth Schemas -------------------------------------- */

// Schema body สำหรับเข้าสู่ระบบด้วย username/password (กัน object หลุดเข้า Prisma where)
const loginBodySchema = z.object({
  username: z.string({ error: LOGIN_REQUIRED }).trim().min(1, LOGIN_REQUIRED),
  password: z.string({ error: LOGIN_REQUIRED }).min(1, LOGIN_REQUIRED),
  rememberMe: z.boolean({ error: 'rememberMe must be a boolean' }).optional(),
});

/* -------------------------------------- Member Schemas -------------------------------------- */

// Schema field ของ member (ตรวจชนิดข้อมูล ส่วนเงื่อนไข required ของการสร้างอยู่ใน createMemberBodySchema)
const memberBodySchema = z.object({
  username: nonEmptyString('username').optional(),
  password: z.string({ error: 'password must be a string' }).min(1, 'password is required').optional(),
  name: optionalText('name'),
  firstName: optionalText('firstName'),
  lastName: optionalText('lastName'),
  email: optionalText('email'),
  phone: optionalText('phone'),
  role: z.enum(MEMBER_ROLES, { error: `role must be one of ${MEMBER_ROLES.join(', ')}` }).optional(),
  status: z.enum(MEMBER_STATUSES, { error: `status must be one of ${MEMBER_STATUSES.join(', ')}` }).optional(),
  permissions: stringArray('permissions').optional(),
});

// Schema body สำหรับสร้าง member: ต้องมี username (หรือ email ที่ใช้แทนได้), password และชื่อ (name หรือ firstName/lastName)
const createMemberBodySchema = memberBodySchema.superRefine((body, ctx) => {
  if (!body.username && !body.email?.split('@')[0]) ctx.addIssue({ code: 'custom', message: 'username or email is required', path: ['username'] });
  else if (!body.password) ctx.addIssue({ code: 'custom', message: 'password is required', path: ['password'] });
  else if (!(body.name || `${body.firstName || ''} ${body.lastName || ''}`.trim())) ctx.addIssue({ code: 'custom', message: 'name, firstName, or lastName is required', path: ['name'] });
});

// Schema query ของรายการสมาชิก (ตัวกรองที่ไม่ใช่ข้อความถือว่าไม่ได้ส่ง)
const memberListQuerySchema = z.looseObject({
  keyword: queryText(),
  status: queryText(),
  role: queryText(),
});

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

// Config จำนวนรายการต่อหน้าของรายการ transaction (default และสูงสุด)
const TRANSACTION_PAGE_SIZE = { default: 10, max: 100 };

// Schema query ของรายการ transaction (ค่าผิดใช้ default: page 1, per_page 10 สูงสุด 100) แปลงชื่อ field เป็นแบบที่ service ใช้
const transactionListQuerySchema = z.looseObject({
  keyword: queryText(),
  plate_no: queryText(),
  bill_no: queryText(),
  page: queryPositiveInt(1),
  per_page: queryPositiveInt(TRANSACTION_PAGE_SIZE.default, TRANSACTION_PAGE_SIZE.max),
  all: queryFlag(),
}).transform(({ keyword, plate_no: plateNo, bill_no: billNo, page, per_page: perPage, all }) => ({ keyword, plateNo, billNo, page, perPage, all }));

// Schema query ของการค้นทะเบียน (exact=true หรือ 1 = ตรงทุกตัวอักษร)
const plateLookupQuerySchema = z.looseObject({
  exact: queryFlag(),
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

/* -------------------------------------- Client Schemas -------------------------------------- */

// Schema body ของ kiosk/barrier gate ที่เปิดใช้งานด้วย activation code
const activateDeviceBodySchema = z.object({
  code: requiredText('Activation code is required'),
});

// Schema body ของ heartbeat (deviceId ถูกเติมจาก device auth ถ้าส่งมาทาง header) field อื่นส่งต่อตามเดิม
const heartbeatBodySchema = z.looseObject({
  deviceId: requiredText('deviceId is required'),
});

// Schema query/body ที่ต้องมีทะเบียนรถ (ค้นหารายการ, สร้าง Omise charge ของ client)
const plateNoInputSchema = z.looseObject({
  plateNo: requiredText('plateNo is required'),
});

/* -------------------------------------- Payment Schemas -------------------------------------- */

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

// Schema body สำหรับบันทึกว่าคืนเงินของ gateway charge แล้ว
const resolveRefundBodySchema = z.object({
  note: nullableString('note'),
});

/* -------------------------------------- Device Schemas -------------------------------------- */

// Schema body สำหรับสร้าง activation code ของ kiosk/barrier gate
const createActivationBodySchema = configObject('body', {
  ...deviceFields,
  deviceType: z.enum(['kiosk', 'barrier_gate'], { error: `deviceType must be one of ${DEVICE_TYPES.join(', ')}` }),
}).refine(hasDeviceName, { error: 'deviceName is required', path: ['deviceName'] });

// Schema body สำหรับ provision camera/printer
const provisionDeviceBodySchema = configObject('body', deviceFields).refine(hasDeviceName, { error: 'deviceName is required', path: ['deviceName'] });

// Schema body สำหรับแก้ไขข้อมูลและ mapping ของอุปกรณ์ (deviceCode ถ้าส่งมาต้องไม่ว่าง)
const updateDeviceBodySchema = configObject('body', {
  ...deviceFields,
  deviceCode: nonEmptyString('deviceCode').optional(),
  deviceName: deviceNameUpdate('deviceName'),
  name: deviceNameUpdate('name'),
  deviceType: z.enum(DEVICE_TYPES, { error: `deviceType must be one of ${DEVICE_TYPES.join(', ')}` }).optional(),
});

// Schema body สำหรับลงทะเบียนเครื่อง EDC (terminalId คือ TID บนสลิป ต้องมี)
const provisionEdcBodySchema = configObject('body', {
  ...deviceFields,
  terminalId: z.string({ error: 'terminalId is required' }).trim().min(1, 'terminalId is required').max(50, 'terminalId must be at most 50 characters'),
}).refine(hasDeviceName, { error: 'deviceName is required', path: ['deviceName'] });

// Schema query ของรายการอุปกรณ์ (ตัวกรองที่ไม่ใช่ข้อความถือว่าไม่ได้ส่ง)
const deviceListQuerySchema = z.looseObject({
  deviceType: queryText(),
  status: queryText(),
  keyword: queryText(),
});

/* -------------------------------------- Settings Schemas -------------------------------------- */

// Schema pricing rule หนึ่งรายการใน PUT (price บังคับ เพราะ PUT แทนที่ rule ทั้งชุด)
const pricingRuleBodySchema = configObject('pricing rule', {
  ...pricingRuleFields,
  price: z.unknown()
    .refine((value) => value !== undefined && value !== null, { error: 'price is required', abort: true })
    .pipe(moneyAmount('price')),
});

// Schema body สำหรับแก้ไข pricing config ทั้งชุด (configUpdatedAt จาก GET ใช้ตรวจว่ามีคนอื่นแก้ไปก่อนหรือไม่)
const updatePricingConfigBodySchema = configObject('body', {
  configUpdatedAt: z.string({ error: 'configUpdatedAt must be a string' }).nullable().optional(),
  pricingRules: z.array(pricingRuleBodySchema, { error: 'pricingRules must be an array' }).optional(),
  paymentChannels: z.array(z.unknown(), { error: 'paymentChannels must be an array' }).optional(),
  serviceChannelMapping: z.array(z.unknown(), { error: 'serviceChannelMapping must be an array' }).optional(),
  masterData: configObject('masterData').optional(),
});

// Schema body สำหรับแก้ไข theme (service เช็ค field ที่ส่งมาด้วย hasOwnProperty จึงไม่เติมค่า default)
// logoUrl รับแค่ null หรือไฟล์ใน /uploads/ (ชื่อไฟล์ห้ามขึ้นต้นด้วย . กัน ../ และ URL ภายนอก)
const updateThemeBodySchema = z.object({
  themeColor: hexColor('themeColor'),
  logoUrl: z.string({ error: 'logoUrl must be a string' })
    .regex(/^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/, { error: 'logoUrl must be null or an /uploads/ path' })
    .nullable()
    .optional(),
  themeMode: z.enum(THEME_MODES, { error: `themeMode must be one of ${THEME_MODES.filter(Boolean).join(', ')} or empty` }).optional(),
  customThemeColor: hexColor('customThemeColor'),
});

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

// Schema body สำหรับแก้ไข payment method (id ใน body ถูกเมินเพื่อไม่ให้ mapping ของ channel เสีย)
const updateMethodBodySchema = configObject('body', {
  label: z.string({ error: 'label must be a string' }).trim().min(1, 'label must not be empty').optional(),
  icon: nullableString('icon'),
  isActive: z.boolean({ error: 'isActive must be a boolean' }).optional(),
});

// Schema body สำหรับแก้ไข method ที่อนุญาตใน channel
const updateChannelBodySchema = z.object({
  allowedMethods: stringArray('allowedMethods'),
});

/* -------------------------------------- Overview Schemas -------------------------------------- */

// Schema query ของ overview: ช่วงวันที่ส่งต่อให้ service ตรวจ (ผิดได้ INVALID_DATE_RANGE) และ include เป็นรายการคั่นด้วย comma เช่น include=edc_payments
const overviewQuerySchema = z.looseObject({
  start_date: queryText(),
  end_date: queryText(),
  startDate: queryText(),
  endDate: queryText(),
  include: queryText().transform((value) => (value ? value.split(',').map((item) => item.trim()) : [])),
});

/* -------------------------------------- WebSocket Schemas -------------------------------------- */

// Schema payload ของ Admin payments:subscribe ต้องระบุ chargeId หรือ plateNo อย่างใดอย่างหนึ่ง
const adminPaymentSubscribeSchema = z.object({
  chargeId: z.string({ error: 'chargeId must be a string' }).trim().optional(),
  plateNo: z.string({ error: 'plateNo must be a string' }).trim().optional(),
}).refine((payload) => payload.chargeId || payload.plateNo, { error: 'chargeId or plateNo is required', path: ['chargeId'] });

// Schema payload ของ client payments:subscribe รับแค่ chargeId (client ไม่มีการยืนยันตัวตน จึงติดตามด้วยทะเบียนไม่ได้)
const clientPaymentSubscribeSchema = z.object({
  chargeId: requiredText('chargeId is required'),
});

// Schema query ของ overview:subscribe และ transactions:subscribe (service ตรวจค่าแต่ละ field เอง)
const streamQuerySchema = z.looseObject({}).default({});

// Schema ตัวกรอง lpr_detected ที่หน้าจอ Barrier Gate ส่งมาใน handshake auth
const lprFiltersSchema = z.object({
  gateId: z.string().trim().min(1).nullish().catch(null).transform((value) => value ?? null),
  direction: z.string().trim().toUpperCase().min(1).nullish().catch(null).transform((value) => value ?? null),
  cameraId: z.string().trim().min(1).nullish().catch(null).transform((value) => value ?? null),
});

export { PAYMENT_EXIT_WINDOW_RANGE, TRANSACTION_STATUSES, activateDeviceBodySchema, adminOmiseChargeInputSchema, adminPaymentBodySchema, adminPaymentSubscribeSchema, adminQrImageInputSchema, cameraTransactionBodySchema, chargeIdInputSchema, clientEdcPaymentBodySchema, clientOmiseChargeInputSchema, clientPaymentSubscribeSchema, createActivationBodySchema, createMemberBodySchema, deviceListQuerySchema, heartbeatBodySchema, loginBodySchema, lprFiltersSchema, memberBodySchema, memberListQuerySchema, overviewQuerySchema, plateLookupQuerySchema, plateNoInputSchema, pricingRuleBodySchema, provisionDeviceBodySchema, provisionEdcBodySchema, requestedAmountInputSchema, resolveRefundBodySchema, streamQuerySchema, systemSettingsBodySchema, transactionListQuerySchema, updateChannelBodySchema, updateDeviceBodySchema, updateMethodBodySchema, updatePricingConfigBodySchema, updateThemeBodySchema, updateTransactionBodySchema };
