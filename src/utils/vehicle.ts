// Import Types
import type { VehicleType } from '../types/shared/transaction.type';

/* -------------------------------------- Config -------------------------------------- */

// Config ประเภทรถที่ระบบคิดราคาได้
const VEHICLE_TYPES = ['car', 'motorcycle'] as const;

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจว่าค่าเป็นประเภทรถที่ระบบรองรับ
function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === 'string' && (VEHICLE_TYPES as readonly string[]).includes(value);
}

// Function ตัดช่องว่างและขีดออกจากทะเบียนรถ และทำตัวอักษรอังกฤษเป็นตัวใหญ่ก่อนค้นหาหรือบันทึก
function normalizePlateNo(plateNo: unknown): string | null {
  return plateNo ? String(plateNo).trim().replace(/[\s-]/g, '').toUpperCase() : null;
}

// Function แปลงประเภทรถเป็นค่าที่ระบบรองรับ ค่าอื่นถือเป็น car
function normalizeVehicleType(vehicleType: unknown): VehicleType {
  const normalized = vehicleType ? String(vehicleType).trim().toLowerCase() : 'car';
  return isVehicleType(normalized) ? normalized : 'car';
}

export { VEHICLE_TYPES, isVehicleType, normalizePlateNo, normalizeVehicleType };
