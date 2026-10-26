// Import Repositories
import * as appConfigRepository from '../repositories/shared/app-config.repository';
// Import Types
import type { MutationResult } from '../types/payment-settings.type';
import type { ConfigUpdater, PaymentChannelSetting, PaymentMethodSetting, PaymentSettings, WithConfigMeta } from '../types/shared/config.type';
// Import Validation
import { parseWithSchema } from '../validation/parser';
import { updateChannelBodySchema, updateMethodBodySchema } from '../validation/schemas';
// Import Utils
import { ApiError } from '../utils/api-error';
import { appEvents } from '../utils/events';

/* -------------------------------------- Helpers -------------------------------------- */

// Function แก้ payment settings ผ่าน updater ที่ล็อก row ไว้ (Admin แก้พร้อมกันไม่ทับกัน) แล้วแจ้งหน้าจอให้โหลดวิธีชำระใหม่
async function updatePaymentSettings(updater: ConfigUpdater<'payment_settings'>): Promise<WithConfigMeta<PaymentSettings>> {
  const saved = await appConfigRepository.updateConfig('payment_settings', updater);
  appEvents.emit('payment_settings_updated', { type: 'payment_settings_updated', at: new Date().toISOString() });
  return saved;
}

// Function หา index ของ method ถ้าไม่พบ throw PAYMENT_METHOD_NOT_FOUND
function requireMethodIndex(methods: PaymentMethodSetting[], id: string): number {
  const index = methods.findIndex((method) => method.id === id);
  if (index === -1) throw new ApiError(404, 'PAYMENT_METHOD_NOT_FOUND', 'Method not found');
  return index;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง payment methods พร้อม configUpdatedAt
async function listMethods(): Promise<{ data: PaymentMethodSetting[]; configUpdatedAt: string | null }> {
  const settings = await appConfigRepository.getConfigWithMeta('payment_settings');
  return { data: settings.methods || [], configUpdatedAt: settings.configUpdatedAt };
}

// Function แก้ไข payment method ด้วย id (ห้ามเปลี่ยน id เพราะ channel อ้างอิง method ด้วย id)
async function updateMethod(id: string, body: unknown): Promise<MutationResult> {
  const data = appConfigRepository.stripConfigMeta(parseWithSchema(updateMethodBodySchema, body));
  await updatePaymentSettings((settings) => {
    const methods = [...(settings.methods || [])];
    const index = requireMethodIndex(methods, id);
    const current = methods[index]!;
    methods[index] = { ...current, ...data, id: current.id, label: data.label ?? current.label };
    return { ...settings, methods };
  });
  return { success: true as const, message: 'Payment method updated' };
}

// Function ดึง payment channels พร้อม configUpdatedAt (code คือค่าที่ส่งเป็น channel ตอนชำระ เช่น ch_cashier -> cashier)
async function listChannels(): Promise<{ data: (PaymentChannelSetting & { code: string })[]; configUpdatedAt: string | null }> {
  const settings = await appConfigRepository.getConfigWithMeta('payment_settings');
  const channels = (settings.channels || []).map((channel) => ({ ...channel, code: String(channel.id || '').replace(/^ch_/, '') }));
  return { data: channels, configUpdatedAt: settings.configUpdatedAt };
}

// Function แก้ไข method ที่อนุญาตใน channel (ทุก method ต้องมีอยู่จริง)
async function updateChannel(id: string, body: unknown): Promise<MutationResult> {
  const { allowedMethods } = parseWithSchema(updateChannelBodySchema, body);
  await updatePaymentSettings((settings) => {
    const methodIds = new Set((settings.methods || []).map((method) => method.id));
    const channels = [...(settings.channels || [])];
    const index = channels.findIndex((channel) => channel.id === id);
    if (index === -1 || allowedMethods.some((methodId) => !methodIds.has(methodId))) {
      throw new ApiError(404, 'PAYMENT_CHANNEL_NOT_FOUND', 'Channel not found or invalid methods');
    }
    channels[index] = { ...channels[index]!, allowedMethods };
    return { ...settings, channels };
  });
  return { success: true as const, message: 'Channel mapping updated' };
}

export { listChannels, listMethods, updateChannel, updateMethod };
