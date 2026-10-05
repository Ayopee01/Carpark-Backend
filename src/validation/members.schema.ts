// Import Library
import { z } from 'zod';
// Import Validation
import { nonEmptyString, stringArray } from './zod';

/* -------------------------------------- Formats -------------------------------------- */

// Format string ที่ไม่บังคับ ตัดช่องว่าง และรองรับ null สำหรับล้างค่า
function optionalText(field: string) {
  return z.string({ error: `${field} must be a string` }).trim().nullable().optional();
}

/* -------------------------------------- Member Schemas -------------------------------------- */

// Schema field ของ member (ตรวจชนิดข้อมูล ส่วนเงื่อนไข required อยู่ใน members.service)
const memberBodySchema = z.object({
  username: nonEmptyString('username').optional(),
  password: z.string({ error: 'password must be a string' }).min(1, 'password is required').optional(),
  name: optionalText('name'),
  firstName: optionalText('firstName'),
  lastName: optionalText('lastName'),
  email: optionalText('email'),
  phone: optionalText('phone'),
  role: nonEmptyString('role').optional(),
  status: nonEmptyString('status').optional(),
  permissions: stringArray('permissions').optional(),
});

export { memberBodySchema };
