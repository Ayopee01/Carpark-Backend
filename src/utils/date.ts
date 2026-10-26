// Import Library
import { TZDate, tz } from '@date-fns/tz';
import { format, isBefore, isValid, parseISO } from 'date-fns';
// Import Types
import type { DateInput } from '../types/shared/common.type';

/* -------------------------------------- Config -------------------------------------- */

// Config timezone ของระบบ (วันที่และเวลาที่แสดงหรือคำนวณเป็นเวลาไทยเสมอ ไม่ขึ้นกับ timezone ของ server)
const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

// Config context ของ date-fns ให้คำนวณตามเวลา Asia/Bangkok (ส่งเป็น { in: inBangkok })
const inBangkok = tz(BANGKOK_TIME_ZONE);

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลงค่าเป็น Date คืน null ถ้าไม่มีค่าหรือเป็นวันที่ไม่ถูกต้อง
function toDateOrNull(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isValid(date) ? date : null;
}

// Function แปลง Date เป็น ISO string คืนค่าเดิมถ้าเป็น string อยู่แล้ว
function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// Function แปลง Date (รวม TZDate ของ date-fns ที่ toISOString เป็น +07:00) เป็น UTC ISO string
function toUtcIso(value: Date | number): string {
  return new Date(+value).toISOString();
}

// Function ตรวจว่าวันที่หมดอายุแล้วหรือยัง (ไม่มีค่าถือว่ายังไม่หมดอายุ)
function isExpired(value: DateInput, now: Date = new Date()): boolean {
  const date = toDateOrNull(value);
  return Boolean(date) && isBefore(date as Date, now);
}

// Function แปลงวันเวลาเป็น Date โดยค่า ISO ที่ไม่ระบุ timezone ถือเป็นเวลาไทย (ค่าไม่ถูกต้องคืน null)
function parseBangkokDateTime(value: unknown): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;

  // รูปแบบอื่นที่ไม่ใช่ ISO (เช่น RFC 2822) ให้ Date อ่านเอง
  const iso = parseISO(text, { in: inBangkok });
  const date = isValid(iso) ? new Date(+iso) : new Date(text);
  return isValid(date) ? date : null;
}

// Function แปลงวันที่เป็น TZDate ตามเวลา Asia/Bangkok ใช้กับ format และฟังก์ชันของ date-fns (ค่าไม่ถูกต้องคืน null)
function toBangkokDate(value: Date | string | number | null | undefined): TZDate | null {
  const date = value instanceof Date ? value : new Date(value ?? Number.NaN);
  return isValid(date) ? new TZDate(date.getTime(), BANGKOK_TIME_ZONE) : null;
}

// Function format วันที่ตามเวลา Asia/Bangkok ด้วย pattern ของ date-fns (ค่าไม่ถูกต้องคืน '')
function formatBangkok(value: Date | string | number | null | undefined, pattern: string): string {
  const date = toBangkokDate(value);
  return date ? format(date, pattern) : '';
}

export { formatBangkok, inBangkok, isExpired, parseBangkokDateTime, toDateOrNull, toIsoOrNull, toUtcIso };
