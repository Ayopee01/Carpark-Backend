// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
// Import Test Helpers
import { fixture, stub } from './support/mock';
// Import Repositories
import * as configRepository from '../src/repositories/config.repository';
// Import Services
import * as pricingService from '../src/services/pricing.service';
// Import Types
import type { PricingConfig, PricingRule } from '../src/types/shared/config.type';
// Import Utils
import type { ApiError } from '../src/utils/api-error';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function แทน config repository ด้วย pricing config ใน memory แล้วคืน function อ่านค่า
function mockPricingConfig(t: TestContext, pricingRules: PricingRule[] = [], updatedAt: Date | null = null): () => PricingConfig {
  let config = fixture<PricingConfig>({ pricingRules });
  stub(t, configRepository, {
    updateConfig: async (key, updater) => {
      const next = await updater(structuredClone(config) as never, { key, data: structuredClone(config) as never, updatedAt });
      if (next) config = fixture<PricingConfig>(structuredClone(next));
      return { ...config, configUpdatedAt: updatedAt?.toISOString() ?? null } as never;
    },
  });
  return () => structuredClone(config);
}

// Function สร้าง config ตามตัวอย่างที่ตกลงกัน: base 1-3, next 4-24, ค่าปรับรายวัน
function validRules(): Record<string, unknown>[] {
  return [
    { feeType: 'base_hour', vehicleType: 'car', hourEnd: 3, price: 30 },
    { feeType: 'next_hour', vehicleType: 'car', hourStart: 4, hourEnd: 24, price: 20 },
    { feeType: 'overnight_day', vehicleType: 'car', price: 100 },
  ];
}

/* -------------------------------------- Tests -------------------------------------- */

test('saves valid rules with base_hour starting at hour 1 and removes obsolete overnight fields', async (t) => {
  const readConfig = mockPricingConfig(t);

  await pricingService.updatePricingConfig({ pricingRules: [...validRules().slice(0, 2), { ...validRules()[2], periodUnit: 'day', chargeMode: 'daily_flat' }] });

  const [base, , overnight] = readConfig().pricingRules;
  assert.ok(base && overnight);
  assert.equal(base.hourStart, 1);
  assert.equal(base.hourEnd, 3);
  assert.equal('periodUnit' in overnight, false);
  assert.equal('chargeMode' in overnight, false);
});

test('rejects next_hour that overlaps base_hour or another next_hour', async (t) => {
  mockPricingConfig(t);
  const overlapBase = validRules();
  overlapBase[1] = { ...overlapBase[1], hourStart: 3 };
  const overlapNext = [...validRules(), { feeType: 'next_hour', vehicleType: 'car', hourStart: 10, hourEnd: 12, price: 0 }];

  await assert.rejects(pricingService.updatePricingConfig({ pricingRules: overlapBase }), { code: 'INVALID_PRICING_RULES', message: /must start after base_hour/ });
  await assert.rejects(pricingService.updatePricingConfig({ pricingRules: overlapNext }), { message: /must not overlap/ });
});

test('rejects next_hour when base_hour already covers 24 hours', async (t) => {
  mockPricingConfig(t);
  const pricingRules = [{ feeType: 'base_hour', vehicleType: 'car', hourEnd: 24, price: 30 }, { feeType: 'next_hour', vehicleType: 'car', hourStart: 5, price: 10 }];

  await assert.rejects(pricingService.updatePricingConfig({ pricingRules }), { message: /not allowed when base_hour covers hour 24/ });
});

test('rejects a PUT built from an old configUpdatedAt instead of overwriting newer rules', async (t) => {
  const savedAt = new Date('2026-10-05T03:00:00.000Z');
  const readConfig = mockPricingConfig(t, [], savedAt);

  await assert.rejects(
    pricingService.updatePricingConfig({ configUpdatedAt: '2026-10-05T02:00:00.000Z', pricingRules: validRules() }),
    { statusCode: 409, code: 'PRICING_CONFIG_CONFLICT' },
  );
  assert.equal(readConfig().pricingRules.length, 0);

  const result = await pricingService.updatePricingConfig({ configUpdatedAt: savedAt.toISOString(), pricingRules: validRules() });
  assert.equal(readConfig().pricingRules.length, 3);
  assert.equal(result.configUpdatedAt, savedAt.toISOString());
});

test('allows free hours with price 0', async (t) => {
  const readConfig = mockPricingConfig(t);

  await pricingService.updatePricingConfig({ pricingRules: [{ feeType: 'base_hour', vehicleType: 'car', hourEnd: 1, price: 0 }, { feeType: 'next_hour', vehicleType: 'car', hourStart: 2, price: 10 }] });

  assert.equal(readConfig().pricingRules[0]?.price, 0);
});

test('INVALID_PRICING_RULES points to the index and id of the rules that conflict', async (t) => {
  mockPricingConfig(t);
  const rules = [...validRules(), { id: 'pr_extra', name: 'Car extra', feeType: 'next_hour', vehicleType: 'car', hourStart: 10, hourEnd: 12, price: 0 }];

  // rule ใหม่ที่ไม่ได้ส่ง id มี ruleIds เป็น null และ index อ้างตำแหน่งใน pricingRules ที่ส่งมา
  await assert.rejects(pricingService.updatePricingConfig({ pricingRules: rules }), (error: ApiError) => {
    assert.equal(error.code, 'INVALID_PRICING_RULES');
    assert.deepEqual(error.details, { vehicleType: 'car', ruleIndexes: [1, 3], ruleIds: [null, 'pr_extra'] });
    assert.match(error.message, /must not overlap \(rules: next_hour, Car extra\)$/);
    return true;
  });
});
