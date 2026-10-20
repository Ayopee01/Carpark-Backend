// Import Library
import type { CookieOptions, Request, Response } from 'express';
import type { IncomingMessage } from 'http';
// Import Types
import type { AuthCookieTokens } from '../types/auth.type';

/* -------------------------------------- Config -------------------------------------- */

// Config ปิด Secure ของ auth cookie สำหรับ dev บน http เท่านั้น (ไม่ตั้ง = Secure) production ห้ามเปิด
const COOKIE_INSECURE = (() => {
  const insecure = process.env.AUTH_COOKIE_INSECURE === 'true';
  if (insecure && process.env.NODE_ENV === 'production') throw new Error('AUTH_COOKIE_INSECURE must not be true in production');
  return insecure;
})();

// Config ชื่อ cookie (prefix __Host-/__Secure- ใช้ได้เฉพาะเมื่อมี Secure) และ path ของ refresh cookie
const AUTH_COOKIES = {
  access: COOKIE_INSECURE ? 'cp_access' : '__Host-cp_access',
  refresh: COOKIE_INSECURE ? 'cp_refresh' : '__Secure-cp_refresh',
  refreshPath: '/api/auth',
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function สร้าง attribute ร่วมของ auth cookie (HttpOnly, SameSite=Strict, ไม่มี Domain จึงผูกกับ host ของ API เท่านั้น)
function cookieOptions(path: string, maxAgeSeconds?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: !COOKIE_INSECURE,
    sameSite: 'strict',
    path,
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds * 1000 } : {}),
  };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function อ่านค่า cookie ตามชื่อจาก header Cookie (ไม่มี = null)
function readCookie(req: Request | IncomingMessage, name: string): string | null {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

// Function อ่าน access token จาก cookie
function readAccessCookie(req: Request | IncomingMessage): string | null {
  return readCookie(req, AUTH_COOKIES.access);
}

// Function อ่าน refresh token จาก cookie (ส่งมาเฉพาะ path /api/auth)
function readRefreshCookie(req: Request | IncomingMessage): string | null {
  return readCookie(req, AUTH_COOKIES.refresh);
}

// Function ตั้ง access/refresh cookie หลัง login/refresh (rememberMe=false = session cookie หายเมื่อปิด browser)
function setAuthCookies(res: Response, tokens: AuthCookieTokens, rememberMe: boolean): void {
  res.cookie(AUTH_COOKIES.access, tokens.token, cookieOptions('/', rememberMe ? tokens.expiresIn : undefined));
  res.cookie(AUTH_COOKIES.refresh, tokens.refreshToken, cookieOptions(AUTH_COOKIES.refreshPath, rememberMe ? tokens.refreshExpiresIn : undefined));
}

// Function ลบ access/refresh cookie (ชื่อและ path เดิม Max-Age=0)
function clearAuthCookies(res: Response): void {
  res.cookie(AUTH_COOKIES.access, '', cookieOptions('/', 0));
  res.cookie(AUTH_COOKIES.refresh, '', cookieOptions(AUTH_COOKIES.refreshPath, 0));
}

// Function ตรวจว่า request มี auth cookie ตัวใดตัวหนึ่ง
function hasAuthCookie(req: Request | IncomingMessage): boolean {
  return Boolean(readAccessCookie(req) || readRefreshCookie(req));
}

export { AUTH_COOKIES, clearAuthCookies, hasAuthCookie, readAccessCookie, readCookie, readRefreshCookie, setAuthCookies };
