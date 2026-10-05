// Import Repositories
import * as configRepository from '../repositories/config.repository';
// Import Types
import type { ReceiptSettings, SystemSettings, WithConfigMeta } from '../types/shared/config.type';
import type { MutationResult } from '../types/system-settings.type';
// Import Validation
import { parseWithSchema } from '../validation/zod';
import { systemSettingsBodySchema } from '../validation/system-settings.schema';

/* -------------------------------------- Helpers -------------------------------------- */

// Function ดึง system settings ปัจจุบัน
async function getCurrentSettings(): Promise<SystemSettings> {
  return configRepository.getConfig('system_settings');
}

// Function บันทึก system settings พร้อม updatedAt
async function saveSettings(settings: SystemSettings): Promise<WithConfigMeta<SystemSettings>> {
  return configRepository.setConfig('system_settings', { ...settings, updatedAt: new Date().toISOString() });
}

// Function รวม receipt ใหม่กับของเดิม โดย entryBill/paymentBill/printer รวมราย field ไม่แทนทั้งก้อน
function mergeReceipt(current: ReceiptSettings = {}, data: ReceiptSettings = {}): ReceiptSettings {
  return {
    ...current,
    ...data,
    entryBill: { ...(current.entryBill || {}), ...(data.entryBill || {}) },
    paymentBill: { ...(current.paymentBill || {}), ...(data.paymentBill || {}) },
    printer: { ...(current.printer || {}), ...(data.printer || {}) },
  };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง system settings พร้อม configUpdatedAt
async function getSystemSettings(): Promise<WithConfigMeta<SystemSettings>> {
  return configRepository.getConfigWithMeta('system_settings');
}

// Function แก้ไข system settings (field ที่ส่งมาจะรวมกับค่าเดิมของแต่ละ group ไม่ล้างค่าที่ไม่ได้ส่ง)
async function updateSystemSettings(body: unknown): Promise<MutationResult> {
  const data = configRepository.stripConfigMeta(parseWithSchema(systemSettingsBodySchema, body));
  const current = await getCurrentSettings();
  await saveSettings({
    ...current,
    ...data,
    general: { ...(current.general || {}), ...((data.general as SystemSettings['general'] | undefined) || {}) },
    receipt: mergeReceipt(current.receipt, data.receipt as ReceiptSettings | undefined),
    billing: { ...(current.billing || {}), ...((data.billing as SystemSettings['billing'] | undefined) || {}) },
  });
  return { success: true as const, message: 'System settings updated' };
}

export { getSystemSettings, updateSystemSettings };
