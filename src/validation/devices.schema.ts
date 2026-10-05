// Import Library
import net from 'net';
import { z } from 'zod';
// Import Validation
import { configObject, nullableString, stringArray } from './zod';

/* -------------------------------------- Config -------------------------------------- */

// Config ประเภทอุปกรณ์ที่ระบบรู้จัก
const DEVICE_TYPES = ['kiosk', 'barrier_gate', 'camera', 'printer', 'edc'];

// Config ข้อความ error ของ direction
const DIRECTION_MESSAGE = 'direction must be IN or OUT';

/* -------------------------------------- Formats -------------------------------------- */

// Format direction เป็น IN/OUT (ไม่สนตัวพิมพ์) หรือค่าว่างเพื่อไม่กำหนดทิศทาง
const directionFormat = z
  .string({ error: DIRECTION_MESSAGE })
  .refine((value) => ['', 'IN', 'OUT'].includes(value.trim().toUpperCase()), { error: DIRECTION_MESSAGE })
  .nullable()
  .optional();

// Format field ร่วมของอุปกรณ์ (service ใช้ allowlist อยู่แล้ว schema นี้ตรวจชนิดข้อมูล)
const deviceFields = {
  deviceName: z.string({ error: 'deviceName must be a string' }).trim().nullable().optional(),
  name: z.string({ error: 'name must be a string' }).trim().nullable().optional(),
  deviceCode: nullableString('deviceCode'),
  location: nullableString('location'),
  gateId: nullableString('gateId'),
  direction: directionFormat,
  cameraIds: stringArray('cameraIds').optional(),
  printerIds: stringArray('printerIds').optional(),
  connectionType: nullableString('connectionType'),
  ipAddress: nullableString('ipAddress'),
  ip: nullableString('ip'),
  cameraRole: nullableString('cameraRole'),
  printerRole: nullableString('printerRole'),
  status: z.string({ error: 'status must be a string' }).optional(),
  isOnline: z.boolean({ error: 'isOnline must be a boolean' }).optional(),
  note: nullableString('note'),
  edcDeviceId: nullableString('edcDeviceId'),
  terminalId: nullableString('terminalId'),
  merchantId: nullableString('merchantId'),
  provider: nullableString('provider'),
  serialNo: nullableString('serialNo'),
  usage: z.enum(['cashier', 'device'], { error: 'usage must be cashier or device' }).optional(),
  // ตรวจราย index ให้ error ชี้ช่องที่ผิด (field allowedIps.<index>)
  allowedIps: z.array(
    z.string({ error: 'allowedIps must contain only strings' }).refine((ip) => net.isIP(ip.trim()) !== 0, { error: 'allowedIps must contain only IP addresses' }),
    { error: 'allowedIps must be an array' },
  ).optional(),
};

// Format ชื่ออุปกรณ์ตอนแก้ไข ถ้าส่งมาต้องไม่ว่างหลังตัดช่องว่าง (null หรือ "" ล้างชื่อไม่ได้)
function deviceNameUpdate(field: string) {
  return z.string({ error: `${field} must be a string` }).trim().min(1, 'deviceName is required').optional();
}

// Function ตรวจว่ามี deviceName หรือ name อย่างใดอย่างหนึ่งที่ไม่ว่างหลังตัดช่องว่าง
function hasDeviceName(body: { deviceName?: string | null; name?: string | null }): boolean {
  return Boolean(body.deviceName?.trim() || body.name?.trim());
}

/* -------------------------------------- Device Schemas -------------------------------------- */

// Schema body สำหรับสร้าง activation code ของ kiosk/barrier gate
const createActivationBodySchema = configObject('body', {
  ...deviceFields,
  deviceType: z.enum(['kiosk', 'barrier_gate'], { error: `deviceType must be one of ${DEVICE_TYPES.join(', ')}` }),
}).refine(hasDeviceName, { error: 'deviceName is required', path: ['deviceName'] });

// Schema body สำหรับ provision camera/printer
const provisionDeviceBodySchema = configObject('body', deviceFields).refine(hasDeviceName, { error: 'deviceName is required', path: ['deviceName'] });

// Schema body สำหรับแก้ไขข้อมูลและ mapping ของอุปกรณ์
const updateDeviceBodySchema = configObject('body', {
  ...deviceFields,
  deviceName: deviceNameUpdate('deviceName'),
  name: deviceNameUpdate('name'),
  deviceType: z.enum(DEVICE_TYPES, { error: `deviceType must be one of ${DEVICE_TYPES.join(', ')}` }).optional(),
});

// Schema body สำหรับลงทะเบียนเครื่อง EDC (terminalId คือ TID บนสลิป ต้องมี)
const provisionEdcBodySchema = configObject('body', {
  ...deviceFields,
  terminalId: z.string({ error: 'terminalId is required' }).trim().min(1, 'terminalId is required').max(50, 'terminalId must be at most 50 characters'),
}).refine(hasDeviceName, { error: 'deviceName is required', path: ['deviceName'] });

export { createActivationBodySchema, provisionDeviceBodySchema, provisionEdcBodySchema, updateDeviceBodySchema };
