// Import Library
import { z } from 'zod';
// Import Types
import type { FieldError, ParseOptions } from '../types/shared/common.type';
// Import Utils
import { ApiError } from '../utils/api-error';

/* -------------------------------------- Config -------------------------------------- */

// Config regex ตัวเลขที่รับจาก form เช่น "30" หรือ "12.5"
const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

/* -------------------------------------- Formats -------------------------------------- */

// Format ตัวเลขตามเงื่อนไข รับทั้ง number และ string ตัวเลข (service เป็นคนแปลงเป็น number ต่อ)
function numberFormat(message: string, check: (value: number) => boolean) {
  return z
    .union([z.number(), z.string().trim().regex(NUMERIC_STRING, { error: message })], { error: message })
    .refine((value) => Number.isFinite(Number(value)) && check(Number(value)), { error: message });
}

// Format ตัวเลขที่ไม่ติดลบ
function nonNegativeNumber(field: string) {
  return numberFormat(`${field} must be a number greater than or equal to 0`, (value) => value >= 0);
}

// Format จำนวนเงินที่ไม่ติดลบและมีทศนิยมไม่เกิน 2 ตำแหน่ง
function moneyAmount(field: string) {
  return numberFormat(`${field} must be a number greater than or equal to 0 with at most 2 decimals`, (value) => value >= 0 && Math.abs(Math.round(value * 100) - value * 100) < 1e-6);
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

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลง zod issues เป็นรายการ { field, message }
function formatZodIssues(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
}

/* -------------------------------------- Functions -------------------------------------- */

// Function validate input ด้วย zod schema คืนค่าที่ parse แล้ว หรือ throw VALIDATION_ERROR พร้อม errors ราย field
function parseWithSchema<TSchema extends z.ZodType>(schema: TSchema, input: unknown, { message, details = {} }: ParseOptions = {}): z.output<TSchema> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;

  const errors = formatZodIssues(result.error);
  throw new ApiError(400, 'VALIDATION_ERROR', message || errors[0]?.message || 'Validation error', { ...details, errors });
}

export { configObject, moneyAmount, nonEmptyString, nonNegativeNumber, nullableString, parseWithSchema, positiveNumber, stringArray };
