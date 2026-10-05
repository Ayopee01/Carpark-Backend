// Import Library
import { z } from 'zod';

/* -------------------------------------- Config -------------------------------------- */

// Config ข้อความเดียวกันทุกกรณี เพื่อไม่บอกว่า field ไหนผิด
const LOGIN_REQUIRED = 'username and password are required';

/* -------------------------------------- Auth Schemas -------------------------------------- */

// Schema body สำหรับเข้าสู่ระบบด้วย username/password (กัน object หลุดเข้า Prisma where)
const loginBodySchema = z.object({
  username: z.string({ error: LOGIN_REQUIRED }).trim().min(1, LOGIN_REQUIRED),
  password: z.string({ error: LOGIN_REQUIRED }).min(1, LOGIN_REQUIRED),
  rememberMe: z.boolean({ error: 'rememberMe must be a boolean' }).optional(),
});

export { loginBodySchema };
