// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { z } from 'zod';
// Import Validation
import { loginBodySchema } from '../../src/validation/auth.schema';
import { createActivationBodySchema, updateDeviceBodySchema } from '../../src/validation/devices.schema';
import { parseWithSchema } from '../../src/validation/zod';
import { updateChannelBodySchema } from '../../src/validation/payment-settings.schema';
import { pricingRuleBodySchema, updatePricingConfigBodySchema } from '../../src/validation/pricing.schema';
import { systemSettingsBodySchema } from '../../src/validation/system-settings.schema';
// Import Utils
import type { ApiError } from '../../src/utils/api-error';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function ดึงข้อความ error แรกจาก schema หรือ null ถ้าผ่าน
function firstError(schema: z.ZodType, body: unknown): string | null {
  const result = schema.safeParse(body);
  return result.success ? null : result.error.issues[0]?.message ?? null;
}

/* -------------------------------------- Tests -------------------------------------- */

test('parseWithSchema throws VALIDATION_ERROR with field errors', () => {
  assert.throws(() => parseWithSchema(loginBodySchema, { username: { not: '' }, password: 'x' }), (error: ApiError) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.deepEqual(error.details.errors, [{ field: 'username', message: 'username and password are required' }]);
    return true;
  });
  assert.deepEqual(parseWithSchema(loginBodySchema, { username: ' admin ', password: 'x' }), { username: 'admin', password: 'x' });
});

test('seeded config shapes still pass validation', () => {
  // frontend ส่งข้อมูลจาก GET กลับมา PUT ได้เหมือนเดิม รวม field ที่ schema ไม่ได้ระบุ
  const pricing = {
    pricingRules: [
      { id: 'pr_car_base_hour', name: 'Car base hour', feeType: 'base_hour', vehicleType: 'car', baseHours: 1, hourStart: 1, hourEnd: 1, price: 20, status: 'active' },
      { id: 'pr_car_overnight_day', feeType: 'overnight_day', vehicleType: 'car', price: '100', status: 'active' },
    ],
    masterData: { serviceTypes: [{ code: 'parking', label: 'Parking' }] },
    configUpdatedAt: '2026-05-16T00:00:00.000Z',
  };
  const settings = {
    general: { systemName: 'Smart Carpark', timezone: 'Asia/Bangkok' },
    receipt: { paymentBill: { showDate: true, expiryDuration: 30 }, printer: { fontSize: 12, paperWidth: 80 }, paperWidth: '80mm' },
    billing: { taxEnabled: false },
  };

  assert.equal((updatePricingConfigBodySchema.parse(pricing).masterData?.serviceTypes as unknown[]).length, 1);
  assert.equal(systemSettingsBodySchema.safeParse(settings).success, true);
});

test('config schemas reject values that used to be silently coerced', () => {
  assert.equal(firstError(pricingRuleBodySchema, { feeType: 'base_hour' }), 'price is required');
  assert.equal(firstError(pricingRuleBodySchema, { price: 'abc' }), 'price must be a number greater than or equal to 0 with at most 2 decimals');
  assert.equal(firstError(pricingRuleBodySchema, { price: 10.123 }), 'price must be a number greater than or equal to 0 with at most 2 decimals');
  assert.match(firstError(pricingRuleBodySchema, { price: 10, feeType: 'overnight_week' }) ?? '', /^feeType must be one of base_hour, next_hour, overnight_day/);
  assert.equal(firstError(pricingRuleBodySchema, { price: 10, hourEnd: 25 }), 'hourEnd must be an integer between 1 and 24');
  assert.match(firstError(pricingRuleBodySchema, { price: 10, feeType: 'hourly' }) ?? '', /^feeType must be one of/);
  assert.equal(firstError(systemSettingsBodySchema, { receipt: { paymentBill: { expiryDuration: 0 } } }), 'paymentBill.expiryDuration must be an integer between 1 and 1440');
  assert.equal(firstError(systemSettingsBodySchema, { receipt: { paymentBill: { expiryDuration: 1e12 } } }), 'paymentBill.expiryDuration must be an integer between 1 and 1440');
  assert.equal(firstError(updateChannelBodySchema, { allowedMethods: 'qr' }), 'allowedMethods must be an array');
});

test('device schemas keep existing messages and check mapping types', () => {
  assert.equal(firstError(createActivationBodySchema, { deviceType: 'kiosk' }), 'deviceName is required');
  assert.equal(firstError(createActivationBodySchema, { deviceName: 'K1', deviceType: 'truck' }), 'deviceType must be one of kiosk, barrier_gate, camera, printer, edc');
  assert.equal(firstError(updateDeviceBodySchema, { cameraIds: 'CAM-1' }), 'cameraIds must be an array');
  assert.equal(firstError(updateDeviceBodySchema, { direction: 'SIDE' }), 'direction must be IN or OUT');
  assert.equal(firstError(updateDeviceBodySchema, { direction: 'out', gateId: null, cameraIds: ['CAM-1'] }), null);
});

test('device schemas point allowedIps errors to the index and reject blank device names', () => {
  const issues = (schema: z.ZodType, body: unknown) => {
    const result = schema.safeParse(body);
    return result.success ? [] : result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
  };

  assert.deepEqual(issues(updateDeviceBodySchema, { allowedIps: ['10.0.0.1', '10.0.0.999'] }), [{ field: 'allowedIps.1', message: 'allowedIps must contain only IP addresses' }]);
  assert.equal(firstError(createActivationBodySchema, { deviceType: 'kiosk', deviceName: '   ' }), 'deviceName is required');
  assert.equal(firstError(updateDeviceBodySchema, { deviceName: '   ' }), 'deviceName is required');
  assert.equal(firstError(updateDeviceBodySchema, { deviceName: null }), 'deviceName must be a string');
  assert.equal(updateDeviceBodySchema.parse({ deviceName: '  Kiosk A  ' }).deviceName, 'Kiosk A');
});
