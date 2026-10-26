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


// Type token ที่ใช้ระบุ session ตอน logout (access token หมดอายุแล้วใช้ refresh token แทน)
export interface LogoutTokens {
  accessToken?: string | null;
  refreshToken?: string | null;
}
