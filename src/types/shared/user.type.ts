// Import Library
import type { User } from '@prisma/client';

/* -------------------------------------- User Types -------------------------------------- */

// Type permission ของผู้ใช้ Admin
export type Permission = 'dashboard' | 'overview' | 'transactions' | 'pricing' | 'devices' | 'theme' | 'settings';

// Type ผู้ใช้ในรูปแบบ API (ไม่มี passwordHash)
export interface UserApi {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  permissions: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Type ผู้ทำรายการ (user ที่ login และ session ปัจจุบัน)
export interface Actor {
  user?: UserApi;
  sessionId?: string | null;
}

/* -------------------------------------- Token Types -------------------------------------- */

// Type payload ที่ sign ใน access/refresh token
export interface TokenPayload {
  type: 'access' | 'refresh';
  sub: string;
  sid: string;
  exp: number;
  iat: number;
  nonce: string;
}

/* -------------------------------------- User Repository Types -------------------------------------- */

// Type field ของ user ที่แก้ไขได้
export interface UserPatch {
  username?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  permissions?: string[];
  status?: string;
  passwordHash?: string;
}

/* -------------------------------------- User Mapper Types -------------------------------------- */

// Type user record ที่ query มาโดยไม่มี passwordHash
export type SafeUserRow = Omit<User, 'passwordHash'>;
