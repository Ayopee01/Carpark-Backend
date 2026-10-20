// Import Library
import type { NextFunction, Request, Response } from 'express';
// Import Utils
import { ApiError } from '../utils/api-error';
import { isAdminOrigin } from '../utils/origins';

/* -------------------------------------- Config -------------------------------------- */

// Config method ที่ไม่เปลี่ยนข้อมูล (ไม่ต้องตรวจ Content-Type)
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Config path ที่รับ multipart/form-data แทน JSON (upload logo)
const MULTIPART_PATHS = new Set(['/api/theme/logo']);

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจว่า request มี body (ไม่มี body เช่น DELETE หรือ POST verify ไม่ต้องตรวจ Content-Type)
function hasBody(req: Request): boolean {
  return Number(req.get('content-length') || 0) > 0 || Boolean(req.get('transfer-encoding'));
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจ request ที่ยืนยันตัวตนด้วย cookie: Origin ต้องเป็นของ Admin Frontend (กัน CSRF จาก subdomain อื่นที่ browser แนบ cookie ไปด้วย)
// และ request ที่มี body ต้องเป็น JSON (ยกเว้น upload logo เป็น multipart) เพราะ form HTML ส่ง JSON ไม่ได้โดยไม่ผ่าน preflight
function assertCookieRequestAllowed(req: Request): void {
  if (!isAdminOrigin(req.get('origin'))) throw new ApiError(403, 'CSRF_REJECTED', 'Cookie authentication requires an allowed Admin origin');
  if (SAFE_METHODS.has(req.method) || !hasBody(req)) return;
  if (req.is('application/json') || (MULTIPART_PATHS.has(req.path) && req.is('multipart/form-data'))) return;
  throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must be application/json');
}

// Function middleware ของ login/refresh/logout: ถ้า browser ส่ง Origin มา ต้องเป็นของ Admin Frontend (กัน login/logout CSRF) ไม่มี Origin = client อื่นที่ใช้ Bearer
function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (origin && !isAdminOrigin(origin)) return next(new ApiError(403, 'CSRF_REJECTED', 'Origin is not allowed'));
  return next();
}

export { assertCookieRequestAllowed, requireTrustedOrigin };
