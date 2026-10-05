// Import Library
import express from 'express';
import type { Request } from 'express';
// Import Middlewares
import { requireTrustedOrigin } from '../middlewares/csrf.middleware';
import { loginRateLimit } from '../middlewares/rate-limit.middleware';
// Import Services
import * as authService from '../services/auth.service';
// Import Utils
import { ApiError } from '../utils/api-error';
import { clearAuthCookies, readAccessCookie, readRefreshCookie, setAuthCookies } from '../utils/auth-cookies';
import { isAdminOrigin } from '../utils/origins';

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือกโหมด cookie เมื่อ request มาจาก origin ของ Admin Frontend (client อื่นไม่มี Origin ใช้ token ใน body/Bearer ตามเดิม)
function isCookieMode(req: Request): boolean {
  return isAdminOrigin(req.get('origin'));
}

// Function อ่าน access token จาก Authorization: Bearer
function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
}

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(requireTrustedOrigin);

// Route เข้าสู่ระบบด้วย username/password: Admin Frontend ได้ session cookie (body ไม่มี token) client อื่นได้ token ใน body
router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const result = await authService.login(req.body, { userAgent: req.get('user-agent'), ipAddress: req.ip });
    if (!isCookieMode(req)) return void res.json(authService.toBearerResponse(result));

    setAuthCookies(res, result, result.rememberMe);
    res.json(authService.toCookieSessionResponse(result));
  } catch (error) {
    next(error);
  }
});

// Route ออกจากระบบ: ระบุ session จาก access token หรือ refresh token (ใช้ได้แม้ access token หมดอายุ) ตอบสำเร็จและลบ cookie เสมอ
router.post('/logout', async (req, res, next) => {
  try {
    const cookieMode = isCookieMode(req);
    const result = await authService.logoutWithTokens({
      accessToken: readBearerToken(req) || (cookieMode ? readAccessCookie(req) : null),
      refreshToken: cookieMode ? readRefreshCookie(req) : req.body?.refreshToken,
    });
    if (cookieMode) clearAuthCookies(res);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Route ดึงข้อมูล user ปัจจุบันจาก access token (Bearer หรือ cookie)
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

// Route ออก token ชุดใหม่ด้วย refresh token: Admin Frontend อ่านจาก cookie แล้วตั้ง cookie ใหม่ (คง rememberMe เดิมของ session)
// ส่ง refresh token เดิมซ้ำในช่วงผ่อนผัน 30 วินาทีได้ 401 แต่ไม่ลบ cookie เพราะอีกแท็บเพิ่งได้ cookie ใหม่ กรณีอื่นที่ 401 ลบ cookie
router.post('/refresh', async (req, res, next) => {
  if (!isCookieMode(req)) {
    try {
      return void res.json(authService.toBearerResponse(await authService.refresh(req.body)));
    } catch (error) {
      return next(error);
    }
  }

  const refreshToken = readRefreshCookie(req);
  try {
    if (!refreshToken) throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
    const result = await authService.refresh({ refreshToken });
    setAuthCookies(res, result, result.rememberMe);
    res.json(authService.toCookieSessionResponse(result));
  } catch (error) {
    const graceRetry = error instanceof ApiError && error.code === 'INVALID_REFRESH_TOKEN' && (await authService.isRefreshGraceRetry(refreshToken).catch(() => false));
    if (error instanceof ApiError && error.statusCode === 401 && !graceRetry) clearAuthCookies(res);
    next(error);
  }
});

export default router;
