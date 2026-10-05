// Import Library
import type { NextFunction, Request, RequestHandler, Response } from 'express';
// Import Types
import type { Permission } from '../types/shared/user.type';
// Import Utils
import { ApiError } from '../utils/api-error';

/* -------------------------------------- Functions -------------------------------------- */

// Function middleware ตรวจว่า user มี permission ที่ route ต้องการ (log รายละเอียดไว้ฝั่ง server เท่านั้น)
function authorize(permission?: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    if (!permission || (Array.isArray(req.user.permissions) && req.user.permissions.includes(permission))) return next();

    console.warn('Forbidden access', {
      userId: req.user.id,
      requiredPermission: permission,
      userPermissions: req.user.permissions || [],
      path: req.originalUrl,
      method: req.method,
    });
    return next(new ApiError(403, 'FORBIDDEN', 'Forbidden'));
  };
}

export { authorize };
