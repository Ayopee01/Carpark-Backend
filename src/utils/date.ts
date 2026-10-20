// Import Types
import type { BangkokDateParts, BangkokDateTimeParts, DateInput } from '../types/shared/common.type';

/* -------------------------------------- Config -------------------------------------- */

// Config offset ชั่วโมงของเวลา Asia/Bangkok เทียบกับ UTC
const BANGKOK_UTC_OFFSET_HOURS = 7;

// Config formatter วันที่ตามเวลา Bangkok (สร้างครั้งเดียว เพราะถูกเรียกทุกวันของทุก transaction ตอนคำนวณค่าจอด)
const BANGKOK_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });

// Config รูปแบบวันเวลาที่ไม่ระบุ timezone (คั่นด้วย T หรือช่องว่าง) ซึ่งถือเป็นเวลาไทย
const LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?)$/;

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลงค่าเป็น Date คืน null ถ้าไม่มีค่าหรือเป็นวันที่ไม่ถูกต้อง
function toDateOrNull(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Function แปลง Date เป็น ISO string คืนค่าเดิมถ้าเป็น string อยู่แล้ว
function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// Function ตรวจว่าวันที่หมดอายุแล้วหรือยัง (ไม่มีค่าถือว่ายังไม่หมดอายุ)
function isExpired(value: DateInput, now: Date = new Date()): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date < now;
}

// Function แปลงวันเวลาเป็น Date โดยค่าที่ไม่ระบุ timezone ถือเป็นเวลาไทย (ค่าไม่ถูกต้องคืน null)
function parseBangkokDateTime(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value ?? '').trim();
  if (!text) return null;

  const local = text.match(LOCAL_DATE_TIME_PATTERN);
  const date = new Date(local ? `${local[1]}T${local[2]}+07:00` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Function แยกวันที่เป็น year/month/day ตามเวลา Asia/Bangkok
function getBangkokParts(value: Date | string | number | null = new Date()): BangkokDateParts {
  const date = value instanceof Date ? value : new Date(value ?? Number.NaN);
  if (Number.isNaN(date.getTime())) return { year: 0, month: 0, day: 0 };

  const parts = BANGKOK_DATE_FORMAT.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

// Function แปลงวันเวลาตามเวลา Bangkok เป็น UTC ISO string
function bangkokDateToUtcIso(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour - BANGKOK_UTC_OFFSET_HOURS, minute, second, ms)).toISOString();
}

// Function แยกวันที่และเวลาเป็นส่วน ๆ ตามเวลา Asia/Bangkok (ไม่ขึ้นกับ timezone ของ server)
function getBangkokDateTimeParts(value: Date | string | number | null = new Date()): BangkokDateTimeParts {
  const date = value instanceof Date ? value : new Date(value ?? Number.NaN);
  const shifted = new Date(date.getTime() + BANGKOK_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export { BANGKOK_UTC_OFFSET_HOURS, bangkokDateToUtcIso, getBangkokDateTimeParts, getBangkokParts, isExpired, parseBangkokDateTime, toDateOrNull, toIsoOrNull };
