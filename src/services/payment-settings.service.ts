// Import Repositories
import * as configRepository from '../repositories/config.repository';
// Import Types
import type { MutationResult } from '../types/payment-settings.type';
import type { ConfigUpdater, PaymentChannelSetting, PaymentMethodSetting, PaymentSettings, WithConfigMeta } from '../types/shared/config.type';
// Import Validation
import { parseWithSchema } from '../validation/zod';
import { updateChannelBodySchema, updateMethodBodySchema } from '../validation/payment-settings.schema';
// Import Utils
import { ApiError } from '../utils/api-error';
import { appEvents } from '../utils/events';

/* -------------------------------------- Config -------------------------------------- */

// Config method หลักที่ลบไม่ได้ (ไม่มี API สร้างคืน ให้ปิดด้วย isActive=false แทน)
const PROTECTED_METHOD_IDS: string[] = ['cash', 'qr', 'promptpay', 'card', 'mobile_banking', 'bank1', 'wallet', 'other'];

// Config channel หลักที่ลบไม่ได้ เพราะ flow ชำระเงินของแต่ละช่องทางอ้างอิง channel นี้
const PROTECTED_CHANNEL_IDS: string[] = ['ch_cashier', 'ch_kiosk', 'ch_mobile', 'ch_gate'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function แก้ payment settings ผ่าน updater ที่ล็อก row ไว้ (Admin แก้พร้อมกันไม่ทับกัน) แล้วแจ้งหน้าจอให้โหลดวิธีชำระใหม่
async function updatePaymentSettings(updater: ConfigUpdater<'payment_settings'>): Promise<WithConfigMeta<PaymentSettings>> {
  const saved = await configRepository.updateConfig('payment_settings', updater);
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
  const settings = await configRepository.getConfigWithMeta('payment_settings');
  return { data: settings.methods || [], configUpdatedAt: settings.configUpdatedAt };
}

// Function แก้ไข payment method ด้วย id (ห้ามเปลี่ยน id เพราะ channel อ้างอิง method ด้วย id)
async function updateMethod(id: string, body: unknown): Promise<MutationResult> {
  const data = configRepository.stripConfigMeta(parseWithSchema(updateMethodBodySchema, body));
  await updatePaymentSettings((settings) => {
    const methods = [...(settings.methods || [])];
    const index = requireMethodIndex(methods, id);
    const current = methods[index]!;
    methods[index] = { ...current, ...data, id: current.id, label: data.label ?? current.label };
    return { ...settings, methods };
  });
  return { success: true as const, message: 'Payment method updated' };
}

// Function ลบ payment method ที่ไม่ใช่ method หลัก และเอา method นี้ออกจาก allowedMethods ของทุก channel
async function deleteMethod(id: string): Promise<MutationResult> {
  await updatePaymentSettings((settings) => {
    requireMethodIndex(settings.methods || [], id);
    if (PROTECTED_METHOD_IDS.includes(id)) {
      throw new ApiError(409, 'PAYMENT_METHOD_PROTECTED', 'Core payment method cannot be deleted, set isActive to false instead');
    }
    return {
      ...settings,
      methods: (settings.methods || []).filter((method) => method.id !== id),
      channels: (settings.channels || []).map((channel) => ({
        ...channel,
        allowedMethods: Array.isArray(channel.allowedMethods) ? channel.allowedMethods.filter((methodId) => methodId !== id) : channel.allowedMethods,
      })),
    };
  });
  return { success: true as const, message: 'Payment method deleted' };
}

// Function ดึง payment channels พร้อม configUpdatedAt (code คือค่าที่ส่งเป็น channel ตอนชำระ เช่น ch_cashier -> cashier)
async function listChannels(): Promise<{ data: (PaymentChannelSetting & { code: string })[]; configUpdatedAt: string | null }> {
  const settings = await configRepository.getConfigWithMeta('payment_settings');
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

// Function ลบ payment channel ที่ไม่ใช่ channel หลักด้วย id
async function deleteChannel(id: string): Promise<MutationResult> {
  await updatePaymentSettings((settings) => {
    const channels = settings.channels || [];
    if (!channels.some((channel) => channel.id === id)) throw new ApiError(404, 'PAYMENT_CHANNEL_NOT_FOUND', 'Channel not found');
    if (PROTECTED_CHANNEL_IDS.includes(id)) throw new ApiError(409, 'PAYMENT_CHANNEL_PROTECTED', 'Core payment channel cannot be deleted');
    return { ...settings, channels: channels.filter((channel) => channel.id !== id) };
  });
  return { success: true as const, message: 'Payment channel deleted' };
}

export { deleteChannel, deleteMethod, listChannels, listMethods, updateChannel, updateMethod };
