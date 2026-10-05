// Import Library
import type { NextFunction, Request, Response } from 'express';
// Import Middlewares
import { assertCookieRequestAllowed } from './csrf.middleware';
// Import Services
import * as authService from '../services/auth.service';
// Import Utils
import { ApiError } from '../utils/api-error';
import { readAccessCookie } from '../utils/auth-cookies';

/* -------------------------------------- Config -------------------------------------- */

// Config path ที่ไม่ต้องใช้ access token (route อื่นที่ public ถูก mount ก่อน middleware นี้) logout ระบุ session เองจาก access หรือ refresh token
const PUBLIC_PATH_PREFIXES = ['/health', '/docs', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

/* -------------------------------------- Functions -------------------------------------- */

// Function middleware ตรวจ access token จาก Authorization: Bearer (client อื่น/Postman) หรือ cookie ของ Admin Frontend แล้วเก็บ user, token, sessionId ไว้ใน request
// request ที่ใช้ cookie ต้องมาจาก origin ของ Admin และส่ง JSON (CSRF)
async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (req.path === '/' || PUBLIC_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

  try {
    const authHeader = req.headers.authorization;
    let token: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    } else {
      token = readAccessCookie(req);
      if (token) assertCookieRequestAllowed(req);
    }
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

    const { user, sessionId } = await authService.authenticateAccessToken(token);
    req.user = user;
    req.token = token;
    req.sessionId = sessionId;
    return next();
  } catch (err) {
    return next(err);
  }
}

export { authMiddleware };
