// Import Utils
import { requireEnv } from './env';

/* -------------------------------------- Config -------------------------------------- */

// Config origin ของ Admin Frontend ที่เรียก API ด้วย session cookie (credentials) ต้องตั้งใน .env เป็นรายการ origin ตรงตัว ห้ามใช้ *
const ADMIN_ORIGINS = new Set(requireEnv('ADMIN_ORIGINS'));

// Config origin ของ client อื่น (Kiosk, Barrier Gate, Mobile) ที่เรียก /api/client แบบไม่มี credentials (* = ทุก origin นอก production)
// เดิมชื่อ CORS_ORIGINS ถ้า server ยังตั้งชื่อเดิมให้ error บอกชื่อใหม่ (ไม่อ่านแทนกัน)
const CLIENT_ORIGINS = (() => {
  if (!process.env.CLIENT_ORIGINS && process.env.CORS_ORIGINS) throw new Error('CORS_ORIGINS was renamed to CLIENT_ORIGINS, rename it in .env');
  const origins = requireEnv('CLIENT_ORIGINS');
  return origins === '*' ? origins : new Set(origins);
})();

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจว่า origin เป็นของ Admin Frontend (ใช้ cookie ได้)
function isAdminOrigin(origin: string | null | undefined): boolean {
  return Boolean(origin) && ADMIN_ORIGINS.has(String(origin));
}

// Function ตรวจว่า origin เป็นของ client อื่นที่เรียก /api/client ได้ (ไม่ใช้ cookie)
function isClientOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (CLIENT_ORIGINS === '*') return process.env.NODE_ENV !== 'production';
  return CLIENT_ORIGINS.has(origin);
}

export { isAdminOrigin, isClientOrigin };
