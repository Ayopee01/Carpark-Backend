// Import Library
import type { Prisma } from '@prisma/client';

/* -------------------------------------- Database Types -------------------------------------- */

// Type client ที่ repository ใช้ query (Prisma client ปกติ หรือ transaction client)
export type DbClient = Prisma.TransactionClient;

/* -------------------------------------- Validation Types -------------------------------------- */

// Type error ราย field ที่ส่งกลับใน VALIDATION_ERROR
export interface FieldError {
  field: string | null;
  message: string;
}

// Type ตัวเลือกของ parseWithSchema
export interface ParseOptions {
  message?: string;
  details?: Record<string, unknown>;
}

/* -------------------------------------- Pagination Types -------------------------------------- */

// Type ค่า pagination ที่ปลอดภัยสำหรับ query database
export interface Pagination {
  page: number;
  perPage: number;
  from: number;
  to: number;
}

// Type meta response ของรายการแบบแบ่งหน้า
export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/* -------------------------------------- Bangkok Time Types -------------------------------------- */

// Type วันที่แยกส่วนตามเวลา Bangkok
export interface BangkokDateParts {
  year: number;
  month: number;
  day: number;
}

// Type วันเวลาแยกส่วนตามเวลา Bangkok
export interface BangkokDateTimeParts extends BangkokDateParts {
  hour: number;
  minute: number;
  second: number;
}

/* -------------------------------------- Date Types -------------------------------------- */

// Type ค่าวันเวลาที่รับได้ (Date, ISO string หรือ timestamp)
export type DateInput = Date | string | number | null | undefined;

/* -------------------------------------- OpenAPI Types -------------------------------------- */

// Type OpenAPI object ทั่วไป (schema, response, parameter)
export type OpenApiObject = Record<string, unknown>;

// Type security requirement ของ OpenAPI
export type SecurityRequirement = Record<string, string[]>;
