// Import Library
import { ipKeyGenerator } from 'express-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';
// Import Services
import * as deviceRegistryService from './device-registry.service';
// Import Types
import type { DeviceTokenResult, SafeDevice } from '../../types/shared/device.type';
// Import Utils
import { ApiError } from '../../utils/api-error';
import { hashToken, timingSafeStringEqual } from '../../utils/crypto';
import { isIpInRanges, normalizeIp } from '../../utils/ip';

/* -------------------------------------- Config -------------------------------------- */

// Config ประเภทอุปกรณ์ที่ต้องตั้ง allowedIps เมื่อเปิด REQUIRE_DEVICE_ALLOWED_IPS (กล้องและ printer ไม่บังคับ)
const ALLOWED_IPS_REQUIRED_TYPES = new Set<string>(['kiosk', 'barrier_gate']);

// Config reason ของ verifyRegisteredDeviceToken ที่นับเป็นการเดา token (inactive คือ token ถูกแต่อุปกรณ์ถูกปิด ไม่นับ)
const DEVICE_AUTH_FAILURE_REASONS = new Set<string>(['invalid_token', 'not_found', 'invalid_type']);

// Config นับการยืนยันตัวตนอุปกรณ์ที่ token ผิดใน 15 นาที (นับเฉพาะครั้งที่ผิด จึงใช้ limiter ตรง ๆ แทน middleware)
// - ต่อ IP + deviceId: DEVICE_AUTH_RATE_LIMIT ครั้ง กันเดา token ของเครื่องหนึ่ง โดยไม่พักตู้อื่นหลัง NAT เดียวกัน
// - ต่อ IP: DEVICE_AUTH_RATE_LIMIT x DEVICE_AUTH_IP_LIMIT_MULTIPLIER ครั้ง กันเดาไล่หลาย deviceId จาก IP เดียว (ครบแล้วพักทั้ง IP)
// window เป็นช่วงคงที่นับจากครั้งแรกที่ผิด request ที่ถูกพักไม่ถูกนับ จึง retry ระหว่างพักไม่ทำให้พักนานขึ้น
// limiter อยู่ใน memory ของ process ถ้ารัน API หลาย instance แต่ละ instance นับแยกกัน
const DEVICE_AUTH_FAILURE_WINDOW_SECONDS = 15 * 60;
const DEVICE_AUTH_FAILURE_LIMIT = Number(process.env.DEVICE_AUTH_RATE_LIMIT);
const DEVICE_AUTH_IP_LIMIT_MULTIPLIER = 10;
const deviceAuthLimiters = {
  device: new RateLimiterMemory({ keyPrefix: 'device-auth-device', points: DEVICE_AUTH_FAILURE_LIMIT, duration: DEVICE_AUTH_FAILURE_WINDOW_SECONDS }),
  ip: new RateLimiterMemory({ keyPrefix: 'device-auth-ip', points: DEVICE_AUTH_FAILURE_LIMIT * DEVICE_AUTH_IP_LIMIT_MULTIPLIER, duration: DEVICE_AUTH_FAILURE_WINDOW_SECONDS }),
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function สร้าง key ของตัวนับต่อ IP และต่อ IP + deviceId
function getDeviceAuthKeys(ip: string | undefined, deviceId: string): { ipKey: string; deviceKey: string } {
  const ipKey = ipKeyGenerator(ip ?? '');
  return { ipKey, deviceKey: `${ipKey}:${deviceId}` };
}

// Function คืนจำนวนวินาทีที่ IP นี้ (หรือ IP + deviceId นี้) ต้องรอเมื่อ token ผิดครบกำหนดแล้ว ยังไม่ครบคืน null
async function getDeviceAuthRetryAfter(ip: string | undefined, deviceId: string): Promise<number | null> {
  const { ipKey, deviceKey } = getDeviceAuthKeys(ip, deviceId);
  const results = await Promise.all([deviceAuthLimiters.device.get(deviceKey), deviceAuthLimiters.ip.get(ipKey)]);
  const retryAfterMs = Math.max(0, ...results.map((result) => (result && result.remainingPoints <= 0 ? result.msBeforeNext : 0)));
  return retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null;
}

// Function นับ token ผิดหนึ่งครั้งทั้งตัวนับต่อ IP และต่อ IP + deviceId (penalty ไม่ reject เมื่อเกินเพดาน)
async function recordDeviceAuthFailure(ip: string | undefined, deviceId: string): Promise<void> {
  const { ipKey, deviceKey } = getDeviceAuthKeys(ip, deviceId);
  await Promise.all([deviceAuthLimiters.ip.penalty(ipKey), deviceAuthLimiters.device.penalty(deviceKey)]);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจ deviceId + deviceToken และประเภทอุปกรณ์ที่อนุญาต
async function verifyRegisteredDeviceToken(deviceId: string | null | undefined, token: string | null | undefined, allowedTypes: string[] = []): Promise<DeviceTokenResult> {
  const device = await deviceRegistryService.getRegisteredDevice(deviceId);
  if (!device) return { ok: false, reason: 'not_found' };
  if (allowedTypes.length && !allowedTypes.includes(device.deviceType)) return { ok: false, reason: 'invalid_type', device };
  if (!['active', 'offline', 'maintenance'].includes(device.status)) return { ok: false, reason: 'inactive', device };
  if (!device.deviceTokenHash || !token || !timingSafeStringEqual(hashToken(token), device.deviceTokenHash)) {
    return { ok: false, reason: 'invalid_token', device };
  }

  return { ok: true, device: deviceRegistryService.toSafeDevice(device) };
}

// Function ตรวจว่าอุปกรณ์ใช้ token จาก IP นี้ได้ไหม (allowedIps เป็น IP หรือ CIDR, ว่าง = ไม่จำกัด ยกเว้น kiosk/barrier gate เมื่อเปิด REQUIRE_DEVICE_ALLOWED_IPS)
function isRequestIpAllowed(device: Pick<SafeDevice, 'deviceType' | 'allowedIps'>, ip: string | null | undefined): boolean {
  const allowedIps = Array.isArray(device.allowedIps) ? device.allowedIps : [];
  if (!allowedIps.length) return !(process.env.REQUIRE_DEVICE_ALLOWED_IPS === 'true' && ALLOWED_IPS_REQUIRED_TYPES.has(device.deviceType));
  return isIpInRanges(ip, allowedIps);
}

// Function แจ้งเตือน Admin ว่าอุปกรณ์ที่ token ถูกต้องถูกปฏิเสธเพราะ IP (ตู้จะอยู่หน้า Maintenance จนกว่า Admin แก้ allowedIps)
function reportDeviceIpBlocked(device: SafeDevice, ip: string | null | undefined): void {
  deviceRegistryService.emitDeviceAlert('device_ip_blocked', device, normalizeIp(ip), device.ipAddress ? normalizeIp(device.ipAddress) : null);
}

// Function ตรวจ device credentials (ใช้ทั้ง HTTP middleware และ Socket.IO) คืนอุปกรณ์ที่ผ่าน หรือ throw ApiError
// 429 มี retryAfter (วินาที) ใน details, token ผิดหรืออุปกรณ์ใช้ไม่ได้ได้ INVALID_DEVICE_CREDENTIALS พร้อม reason
async function authenticateDevice({ deviceId, deviceToken, ip, allowedTypes }: { deviceId: string; deviceToken: string | null; ip: string | undefined; allowedTypes: string[] }): Promise<SafeDevice> {
  // IP + deviceId (หรือทั้ง IP) ที่ token ผิดครบกำหนดถูกพักก่อนตรวจ token จึงเดาต่อไม่ได้ ตู้อื่นหลัง NAT เดียวกันยังใช้งานได้
  const retryAfter = await getDeviceAuthRetryAfter(ip, deviceId);
  if (retryAfter) {
    throw new ApiError(429, 'TOO_MANY_DEVICE_AUTH_ATTEMPTS', 'Too many failed device authentication attempts. Please try again later.', { retryAfter });
  }

  const result = await verifyRegisteredDeviceToken(deviceId, deviceToken, allowedTypes);
  if (!result.ok) {
    if (DEVICE_AUTH_FAILURE_REASONS.has(result.reason)) await recordDeviceAuthFailure(ip, deviceId);
    throw new ApiError(result.reason === 'not_found' ? 401 : 403, 'INVALID_DEVICE_CREDENTIALS', 'Invalid device credentials', { reason: result.reason });
  }
  // อุปกรณ์ที่ Admin กำหนด allowedIps ใช้ token ได้เฉพาะจาก IP เหล่านั้น (token รั่วแล้วใช้จากเครื่องอื่นไม่ได้)
  // token ถูกแล้วจึงไม่นับเป็นการเดา ตู้ที่ตั้ง IP ผิดยังได้ ip_not_allowed ไปหน้า Maintenance ไม่ใช่ 429 และแจ้งเตือน Admin ให้แก้ allowedIps
  if (!isRequestIpAllowed(result.device, ip)) {
    reportDeviceIpBlocked(result.device, ip);
    throw new ApiError(403, 'INVALID_DEVICE_CREDENTIALS', 'Invalid device credentials', { reason: 'ip_not_allowed' });
  }
  return result.device;
}

export { authenticateDevice, isRequestIpAllowed, reportDeviceIpBlocked, verifyRegisteredDeviceToken };
