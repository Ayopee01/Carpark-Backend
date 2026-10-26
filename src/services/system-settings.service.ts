// Import Library
import { deepmergeCustom } from 'deepmerge-ts';
// Import Repositories
import * as configRepository from '../repositories/config.repository';
// Import Types
import type { ReceiptSettings, SystemSettings, WithConfigMeta } from '../types/shared/config.type';
import type { MutationResult } from '../types/system-settings.type';
// Import Validation
import { parseWithSchema } from '../validation/zod';
import { systemSettingsBodySchema } from '../validation/system-settings.schema';

/* -------------------------------------- Config -------------------------------------- */

// Config รวม settings ใหม่กับของเดิมทุกชั้น (field ที่ไม่ได้ส่งคงค่าเดิม) array แทนทั้งก้อนไม่ต่อท้าย
const mergeSettings = deepmergeCustom({ mergeArrays: false });

/* -------------------------------------- Helpers -------------------------------------- */

// Function ดึง system settings ปัจจุบัน
async function getCurrentSettings(): Promise<SystemSettings> {
  return configRepository.getConfig('system_settings');
}

// Function บันทึก system settings พร้อม updatedAt
async function saveSettings(settings: SystemSettings): Promise<WithConfigMeta<SystemSettings>> {
  return configRepository.setConfig('system_settings', { ...settings, updatedAt: new Date().toISOString() });
}

// Function ตัด receipt.paperWidth ที่ไม่ใช้แล้วออก (ความกว้างกระดาษอยู่ที่ receipt.printer.paperWidth)
function withoutReceiptPaperWidth(receipt: ReceiptSettings = {}): ReceiptSettings {
  const { paperWidth: _paperWidth, ...rest } = receipt;
  return rest;
}


/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง system settings พร้อม configUpdatedAt
async function getSystemSettings(): Promise<WithConfigMeta<SystemSettings>> {
  const settings = await configRepository.getConfigWithMeta('system_settings');
  return { ...settings, receipt: withoutReceiptPaperWidth(settings.receipt) };
}

// Function แก้ไข system settings (field ที่ส่งมาจะรวมกับค่าเดิมของแต่ละ group ไม่ล้างค่าที่ไม่ได้ส่ง)
async function updateSystemSettings(body: unknown): Promise<MutationResult> {
  const data = configRepository.stripConfigMeta(parseWithSchema(systemSettingsBodySchema, body));
  const merged = mergeSettings(await getCurrentSettings(), data) as SystemSettings;
  await saveSettings({ ...merged, receipt: withoutReceiptPaperWidth(merged.receipt) });
  return { success: true as const, message: 'System settings updated' };
}

export { getSystemSettings, updateSystemSettings };
