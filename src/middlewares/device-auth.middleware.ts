// Import Library
import type { NextFunction, Request, RequestHandler, Response } from 'express';
// Import Services
import * as deviceRegistryService from '../services/shared/device-registry.service';
// Import Utils
import { ApiError } from '../utils/api-error';

/* -------------------------------------- Helpers -------------------------------------- */

// Function อ่าน deviceId จาก header, body, query หรือ params และตรวจว่าทุกที่ส่งค่าเดียวกัน
function getRequestDeviceIdentity(req: Request): { deviceId: string | null; hasConflict: boolean } {
  const candidates: unknown[] = [req.get('x-device-id'), req.body?.deviceId, req.query?.deviceId, req.params?.deviceId];
  const uniqueIds = [...new Set(candidates.filter((value): value is string => typeof value === 'string' && Boolean(value)))];
  return { deviceId: uniqueIds[0] || null, hasConflict: uniqueIds.length > 1 };
}

// Function แปลง IP ของ request ให้เทียบได้ (ตัด prefix IPv4-mapped IPv6 เช่น ::ffff:10.0.0.5)
function normalizeRequestIp(ip: string | undefined): string {
  return String(ip || '').replace(/^::ffff:/, '');
}

// Function อ่าน device token จาก Authorization: Device <token> หรือ x-device-token
function getRequestDeviceToken(req: Request): string | null {
  const authHeader = req.get('authorization') || '';
  if (authHeader.startsWith('Device ')) return authHeader.replace('Device ', '').trim();
  return req.get('x-device-token') || null;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function middleware บังคับ device credentials ของอุปกรณ์ประเภทที่อนุญาต แล้วเก็บ device และ token ไว้ใน request
function requireDeviceAuth(allowedTypes: string[] = []): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const identity = getRequestDeviceIdentity(req);
      if (identity.hasConflict) throw new ApiError(400, 'DEVICE_IDENTITY_MISMATCH', 'Device identity mismatch');
      if (!identity.deviceId) throw new ApiError(400, 'DEVICE_ID_REQUIRED', 'deviceId is required');

      const deviceToken = getRequestDeviceToken(req);
      const result = await deviceRegistryService.verifyRegisteredDeviceToken(identity.deviceId, deviceToken, allowedTypes);
      if (!result.ok) {
        throw new ApiError(result.reason === 'not_found' ? 401 : 403, 'INVALID_DEVICE_CREDENTIALS', 'Invalid device credentials', { reason: result.reason });
      }
      // อุปกรณ์ที่ Admin กำหนด allowedIps ใช้ token ได้เฉพาะจาก IP เหล่านั้น (token รั่วแล้วใช้จากเครื่องอื่นไม่ได้)
      const allowedIps = Array.isArray(result.device.allowedIps) ? result.device.allowedIps : [];
      if (allowedIps.length && !allowedIps.includes(normalizeRequestIp(req.ip))) {
        throw new ApiError(403, 'INVALID_DEVICE_CREDENTIALS', 'Invalid device credentials', { reason: 'ip_not_allowed' });
      }

      req.device = result.device;
      req.deviceId = result.device.deviceId || identity.deviceId;
      req.deviceToken = deviceToken;
      if (req.body && !req.body.deviceId) req.body.deviceId = req.deviceId;
      // Express 5 สร้าง req.query ใหม่ทุกครั้งที่อ่าน จึงต้องแทนที่ทั้ง property เพื่อให้ deviceId จาก header ไปถึง route
      if (!req.query.deviceId) Object.defineProperty(req, 'query', { value: { ...req.query, deviceId: req.deviceId }, writable: true, configurable: true });
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Function middleware ตรวจ device credentials เฉพาะเมื่อ request ส่ง deviceId มา (mobile ไม่ส่งจึงผ่านได้)
function optionalDeviceAuth(allowedTypes: string[] = []): RequestHandler {
  const requireAuth = requireDeviceAuth(allowedTypes);
  return (req: Request, res: Response, next: NextFunction) => (getRequestDeviceIdentity(req).deviceId ? requireAuth(req, res, next) : next());
}

export { optionalDeviceAuth, requireDeviceAuth };
