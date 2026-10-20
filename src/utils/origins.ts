/* -------------------------------------- Config -------------------------------------- */

// Config origin ของ Admin Frontend ที่เรียก API ด้วย session cookie (credentials) ต้องตั้งใน .env เป็นรายการ origin ตรงตัว ห้ามใช้ *
const ADMIN_ORIGINS = (() => {
  const raw = process.env.ADMIN_ORIGINS;
  if (!raw) throw new Error('ADMIN_ORIGINS is required');
  const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!origins.length || origins.includes('*')) throw new Error('ADMIN_ORIGINS must list exact origins (no *)');
  return new Set(origins);
})();

// Config origin ของ client อื่น (Kiosk, Barrier Gate, Mobile) ที่เรียก /api/client แบบไม่มี credentials (* = ทุก origin นอก production)
// เดิมชื่อ CORS_ORIGINS ถ้า server ยังตั้งชื่อเดิมให้ error บอกชื่อใหม่ (ไม่อ่านแทนกัน)
const CLIENT_ORIGINS = (() => {
  const raw = process.env.CLIENT_ORIGINS;
  if (!raw && process.env.CORS_ORIGINS) throw new Error('CORS_ORIGINS was renamed to CLIENT_ORIGINS, rename it in .env');
  if (!raw) throw new Error('CLIENT_ORIGINS is required');
  return raw === '*' ? '*' as const : new Set(raw.split(',').map((origin) => origin.trim()).filter(Boolean));
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
