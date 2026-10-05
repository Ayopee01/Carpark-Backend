/* -------------------------------------- Pricing Types -------------------------------------- */

// Type ข้อมูล pricing rule ที่รับมา (บาง field หรือรูปแบบเก่า)
export type PricingRuleInput = Record<string, unknown>;

// Type ผลการแก้ไข config พร้อม configUpdatedAt ใหม่ให้ส่งกลับมาใน PUT ครั้งถัดไป
export interface MutationResult {
  success: true;
  message: string;
  configUpdatedAt: string | null;
}
