/* -------------------------------------- Devices Types -------------------------------------- */

// Type สรุปจำนวนอุปกรณ์ตามสถานะ
export interface DeviceCounts {
  total: number;
  online: number;
  offline: number;
  maintenance: number;
  inactive: number;
}

// Type error ที่ map จากเหตุผลของ device registry
export type ErrorSpec = [number, string, string];
