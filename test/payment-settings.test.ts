// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture as asFixture, replace } from './support/mock';
// Import Repositories
import * as configRepository from '../src/repositories/config.repository';
// Import Services
import * as paymentSettingsService from '../src/services/payment-settings.service';
import * as paymentSelectionService from '../src/services/shared/payment-selection.service';
// Import Types
import type { PaymentSettings } from '../src/types/shared/config.type';
// Import Utils
import { appEvents } from '../src/utils/events';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function แทน config repository ด้วย payment settings ใน memory แล้วคืน function อ่านค่าและคืนค่าเดิม
function mockPaymentSettings(): { getSettings: () => PaymentSettings; restore: () => void } {
  let settings: PaymentSettings = {
    methods: [
      { id: 'cash', label: 'Cash', isActive: true },
      { id: 'promptpay', label: 'PromptPay', isActive: true },
      { id: 'card', label: 'Card', isActive: false },
      { id: 'coupon', label: 'Coupon', isActive: true },
    ],
    channels: [
      { id: 'ch_kiosk', name: 'Kiosk', allowedMethods: ['cash', 'promptpay', 'card', 'coupon'] },
      { id: 'ch_mobile', name: 'Mobile', allowedMethods: ['promptpay', 'coupon'] },
      { id: 'ch_event', name: 'Event', allowedMethods: ['cash'] },
    ],
  };
  const restore = replace(configRepository, {
    getConfig: async () => structuredClone(settings),
    getConfigWithMeta: async () => ({ ...structuredClone(settings), configUpdatedAt: 'rev' }),
    setConfig: async (_key, value) => {
      settings = asFixture<PaymentSettings>(structuredClone(value));
      return { ...structuredClone(settings), configUpdatedAt: 'rev' };
    },
    updateConfig: async (key, updater) => {
      const next = await updater(asFixture(structuredClone(settings)), { key, data: asFixture(settings), updatedAt: null });
      if (next !== undefined) settings = asFixture<PaymentSettings>(structuredClone(next));
      return { ...structuredClone(settings), configUpdatedAt: 'rev' };
    },
  });

  return { getSettings: () => structuredClone(settings), restore };
}

/* -------------------------------------- Tests -------------------------------------- */

test('deletes a custom payment method and removes it from every channel allowedMethods', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);

  await paymentSettingsService.deleteMethod('coupon');

  const settings = fixture.getSettings();
  assert.deepEqual(settings.methods.map((method) => method.id), ['cash', 'promptpay', 'card']);
  assert.deepEqual(settings.channels[0].allowedMethods, ['cash', 'promptpay', 'card']);
  assert.deepEqual(settings.channels[1].allowedMethods, ['promptpay']);
});

test('refuses to delete core payment methods and channels that cannot be recreated', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);

  await assert.rejects(paymentSettingsService.deleteMethod('promptpay'), { statusCode: 409, code: 'PAYMENT_METHOD_PROTECTED' });
  await assert.rejects(paymentSettingsService.deleteChannel('ch_kiosk'), { statusCode: 409, code: 'PAYMENT_CHANNEL_PROTECTED' });
  await paymentSettingsService.deleteChannel('ch_event');
  assert.deepEqual(fixture.getSettings().channels.map((channel) => channel.id), ['ch_kiosk', 'ch_mobile']);
});

test('keeps the method id when an update body tries to change it', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);

  await paymentSettingsService.updateMethod('cash', { id: 'hacked', label: 'Cash Desk' });

  assert.deepEqual(fixture.getSettings().methods[0], { id: 'cash', label: 'Cash Desk', isActive: true });
});

test('rejects missing payment settings ids with 404 error codes', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);

  await assert.rejects(paymentSettingsService.deleteMethod('missing'), { statusCode: 404, code: 'PAYMENT_METHOD_NOT_FOUND' });
  await assert.rejects(paymentSettingsService.deleteChannel('missing'), { statusCode: 404, code: 'PAYMENT_CHANNEL_NOT_FOUND' });
});

test('validates payment method against channel allowedMethods', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);

  assert.equal((await paymentSelectionService.validatePaymentSelection('mobile', 'promptpay')).ok, true);
  assert.deepEqual(await paymentSelectionService.validatePaymentSelection('mobile', 'cash'), { ok: false, message: 'Payment method is not allowed for this channel' });
  assert.deepEqual(await paymentSelectionService.validatePaymentSelection('kiosk', 'card'), { ok: false, message: 'Payment method is inactive' });
  await assert.rejects(paymentSelectionService.assertPaymentSelection('mobile', 'cash'), { statusCode: 400, code: 'PAYMENT_SELECTION_INVALID' });
});

test('lists channels with code used as the payment channel value', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);

  const { data } = await paymentSettingsService.listChannels();

  assert.ok(data.length > 0);
  data.forEach((channel) => assert.equal(`ch_${channel.code}`, channel.id));
});

test('lists only active methods allowed for the channel in allowedMethods order', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);

  // card ปิดอยู่ (isActive false) จึงไม่แสดงที่ kiosk แม้อยู่ใน allowedMethods
  assert.deepEqual((await paymentSelectionService.listAvailableMethods('kiosk')).map((method) => method.id), ['cash', 'promptpay', 'coupon']);
  assert.deepEqual(await paymentSelectionService.listAvailableMethods('unknown'), []);
});

test('changing payment settings emits payment_settings_updated for open screens', async (t) => {
  const fixture = mockPaymentSettings();
  t.after(fixture.restore);
  const events: { type: string }[] = [];
  const listener = (event: { type: string }) => events.push(event);
  appEvents.on('payment_settings_updated', listener);
  t.after(() => appEvents.off('payment_settings_updated', listener));

  await paymentSettingsService.updateMethod('card', { isActive: true });
  await paymentSettingsService.updateChannel('ch_mobile', { allowedMethods: ['promptpay'] });

  assert.deepEqual(events.map((event) => event.type), ['payment_settings_updated', 'payment_settings_updated']);
});
