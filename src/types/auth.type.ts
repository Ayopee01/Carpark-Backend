// Import Types
import type { UserApi } from './shared/user.type';

/* -------------------------------------- Auth Types -------------------------------------- */

// Type response ของ login/refresh (user shape เดียวกับ GET /api/auth/me)
export interface AuthTokensResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionExpiresAt: string;
  user: UserApi;
}

// Type ผล login/refresh ภายใน service (rememberMe ของ session ใช้ตั้งอายุ cookie ไม่ส่งออกใน body)
export type AuthSessionResult = AuthTokensResponse & { rememberMe: boolean };

// Type token ที่ใช้ตั้ง auth cookie
export type AuthCookieTokens = Pick<AuthTokensResponse, 'token' | 'refreshToken' | 'expiresIn' | 'refreshExpiresIn'>;

// Type response ของ login/refresh โหมด cookie (Admin Frontend) ไม่มี token ใน body
export type CookieSessionResponse = Pick<AuthTokensResponse, 'user' | 'expiresIn' | 'refreshExpiresIn' | 'sessionExpiresAt'>;

// Type token ที่ใช้ระบุ session ตอน logout (access token หมดอายุแล้วใช้ refresh token แทน)
export interface LogoutTokens {
  accessToken?: string | null;
  refreshToken?: string | null;
}
