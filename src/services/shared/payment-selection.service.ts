// Import Repositories
import * as configRepository from '../../repositories/config.repository';
// Import Types
import type { PaymentMethodSetting } from '../../types/shared/config.type';
import type { AvailablePaymentMethod, PaymentSelection, PaymentSelectionResult } from '../../types/shared/payment.type';
// Import Utils
import { ApiError } from '../../utils/api-error';

/* -------------------------------------- Functions -------------------------------------- */

// Function ตรวจว่า method เปิดใช้งานและอนุญาตใน channel ตาม payment settings
async function validatePaymentSelection(channel: string, method: string): Promise<PaymentSelectionResult> {
  const settings = await configRepository.getConfig('payment_settings');
  const methods = Array.isArray(settings.methods) ? settings.methods : [];
  const channels = Array.isArray(settings.channels) ? settings.channels : [];
  const selectedMethod = methods.find((item) => item.id === method);

  if (!selectedMethod) return { ok: false, message: 'Payment method not found' };
  if (selectedMethod.isActive === false) return { ok: false, message: 'Payment method is inactive' };

  const channelId = channel && channel.startsWith('ch_') ? channel : `ch_${channel}`;
  const selectedChannel = channels.find((item) => (
    item.id === channelId ||
    item.id === channel ||
    String(item.name || '').toLowerCase() === String(channel || '').toLowerCase()
  ));
  if (!selectedChannel) return { ok: false, message: 'Payment channel not found' };
  if (!Array.isArray(selectedChannel.allowedMethods) || !selectedChannel.allowedMethods.includes(method)) {
    return { ok: false, message: 'Payment method is not allowed for this channel' };
  }

  return { ok: true, method: selectedMethod, channel: selectedChannel };
}

// Function ดึง method ที่เปิดใช้งานและอนุญาตใน channel นั้น (เรียงตาม allowedMethods) ให้หน้าจอแสดงเฉพาะวิธีที่ชำระได้จริง
async function listAvailableMethods(channel: string): Promise<AvailablePaymentMethod[]> {
  const settings = await configRepository.getConfig('payment_settings');
  const methods = Array.isArray(settings.methods) ? settings.methods : [];
  const selectedChannel = (Array.isArray(settings.channels) ? settings.channels : []).find((item) => item.id === `ch_${channel}`);
  const allowed = Array.isArray(selectedChannel?.allowedMethods) ? selectedChannel!.allowedMethods : [];

  return allowed
    .map((id) => methods.find((method) => method.id === id))
    .filter((method): method is PaymentMethodSetting => Boolean(method) && method!.isActive !== false)
    .map((method) => ({ id: method.id, label: method.label, icon: method.icon ?? null }));
}

// Function ตรวจ method/channel ตาม payment settings ถ้าไม่ผ่าน throw PAYMENT_SELECTION_INVALID
async function assertPaymentSelection(channel: string, method: string): Promise<PaymentSelection> {
  const result = await validatePaymentSelection(channel, method);
  if (!result.ok) throw new ApiError(400, 'PAYMENT_SELECTION_INVALID', result.message);
  return result;
}

export { assertPaymentSelection, listAvailableMethods, validatePaymentSelection };
