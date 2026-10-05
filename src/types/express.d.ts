// Import Types
import type { SafeDevice } from './shared/device.type';
import type { UserApi } from './shared/user.type';

/* -------------------------------------- Express Request Types -------------------------------------- */

// Type ข้อมูลที่ middleware เพิ่มเข้า Express Request
declare global {
  namespace Express {
    interface Request {
      user?: UserApi;
      token?: string;
      sessionId?: string;
      device?: SafeDevice;
      deviceId?: string;
      deviceToken?: string | null;
      rawBody?: string;
    }
  }
}

export {};
