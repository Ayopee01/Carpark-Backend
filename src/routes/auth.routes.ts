// Import Library
import express from 'express';
import type { Request } from 'express';
// Import Middlewares
import { loginRateLimit } from '../middlewares/rate-limit.middleware';
// Import Services
import * as authService from '../services/auth.service';

/* -------------------------------------- Helpers -------------------------------------- */

// Function อ่าน access token จาก Authorization: Bearer
function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
}

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

// Route เข้าสู่ระบบด้วย username/password ได้ access token และ refresh token ใน body
router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    res.json(await authService.login(req.body, { userAgent: req.get('user-agent'), ipAddress: req.ip }));
  } catch (error) {
    next(error);
  }
});

// Route ออกจากระบบ: ระบุ session จาก access token (Bearer) หรือ refresh token ใน body (ใช้ได้แม้ access token หมดอายุ) ตอบสำเร็จเสมอ
router.post('/logout', async (req, res, next) => {
  try {
    res.json(await authService.logoutWithTokens({ accessToken: readBearerToken(req), refreshToken: req.body?.refreshToken }));
  } catch (error) {
    next(error);
  }
});

// Route ดึงข้อมูล user ปัจจุบันจาก access token
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

// Route ออก token ชุดใหม่ด้วย refresh token ใน body
router.post('/refresh', async (req, res, next) => {
  try {
    res.json(await authService.refresh(req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
