// Import Library
import type { NextFunction, Request, RequestHandler, Response } from 'express';
// Import Types
import type { Permission, UserApi } from '../types/shared/user.type';
// Import Utils
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจว่า user มี permission นี้
function hasPermission(user: UserApi | null | undefined, permission: Permission): boolean {
  return Boolean(user && Array.isArray(user.permissions) && user.permissions.includes(permission));
}

// Function middleware ตรวจว่า user มี permission ที่ route ต้องการ ส่งเป็น array = มีอย่างใดอย่างหนึ่งก็ผ่าน (log รายละเอียดไว้ฝั่ง server เท่านั้น)
function authorize(permission?: Permission | Permission[]): RequestHandler {
  const required = permission === undefined ? [] : ([] as Permission[]).concat(permission);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    if (!required.length || required.some((item) => hasPermission(req.user, item))) return next();

    logger.warn({
      userId: req.user.id,
      requiredPermission: permission,
      userPermissions: req.user.permissions || [],
      path: req.originalUrl,
      method: req.method,
    }, 'Forbidden access');
    return next(new ApiError(403, 'FORBIDDEN', 'Forbidden'));
  };
}

export { authorize, hasPermission };
