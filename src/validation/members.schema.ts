// Import Library
import { z } from 'zod';
// Import Validation
import { nonEmptyString, stringArray } from './zod';

/* -------------------------------------- Config -------------------------------------- */

// Config role ของสมาชิก (สิทธิ์จริงอยู่ที่ permissions ส่วน role ใช้แสดงผลและกฎ super_admin)
const MEMBER_ROLES = ['super_admin', 'staff'] as const;

// Config สถานะของสมาชิก (inactive = login ไม่ได้และ session เดิมถูกตัด)
const MEMBER_STATUSES = ['active', 'inactive'] as const;

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
  role: z.enum(MEMBER_ROLES, { error: `role must be one of ${MEMBER_ROLES.join(', ')}` }).optional(),
  status: z.enum(MEMBER_STATUSES, { error: `status must be one of ${MEMBER_STATUSES.join(', ')}` }).optional(),
  permissions: stringArray('permissions').optional(),
});

export { memberBodySchema };
