// Import Library
import { z } from 'zod';
// Import Types
import type { FieldError, ParseOptions } from '../types/shared/common.type';
// Import Utils
import { ApiError } from '../utils/api-error';

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

export { parseWithSchema };
