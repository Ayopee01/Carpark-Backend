// Import Library
import assert from 'node:assert/strict';
import { test } from 'node:test';
// Import Types
import type { PricingRuleInput } from '../../src/types/shared/transaction.type';
// Import Utils
import { calculateFee, roundMoney } from '../../src/utils/pricing';

/* -------------------------------------- Config -------------------------------------- */

// Config ชั่วโมงที่ 1-3 ชั่วโมงละ 30, ชั่วโมงที่ 4-24 ชั่วโมงละ 20 และค่าปรับข้ามคืนละ 100
const carRules: PricingRuleInput[] = [
  { feeType: 'base_hour', vehicleType: 'car', hourStart: 1, hourEnd: 3, price: 30, status: 'active' },
  { feeType: 'next_hour', vehicleType: 'car', hourStart: 4, hourEnd: 24, price: 20, status: 'active' },
  { feeType: 'overnight_day', vehicleType: 'car', price: 100, status: 'active' },
];

// Config ชั่วโมงแรกฟรี ชั่วโมงที่ 2-24 ชั่วโมงละ 10
const freeFirstHourRules: PricingRuleInput[] = [
  { feeType: 'base_hour', vehicleType: 'car', hourStart: 1, hourEnd: 1, price: 0, status: 'active' },
  { feeType: 'next_hour', vehicleType: 'car', hourStart: 2, hourEnd: null, price: 10, status: 'active' },
];

/* -------------------------------------- Tests -------------------------------------- */

test('same day parking charges base hours then next hours', () => {
  const fee = calculateFee('2026-05-04T08:00:00+07:00', '2026-05-04T12:30:00+07:00', carRules);

  // 5 ชั่วโมง = (3 x 30) + (2 x 20)
  assert.equal(fee.totalHours, 5);
  assert.equal(fee.totalAmount, 130);
  assert.equal(fee.nights, 0);
});

test('crossing midnight charges one night and restarts hourly counting on the new day', () => {
  const fee = calculateFee('2026-05-04T20:00:00+07:00', '2026-05-05T08:00:00+07:00', carRules);

  // วันแรก 4 ชม. = 90 + 20, ค่าปรับ 1 คืน = 100, วันใหม่ 8 ชม. = 90 + (5 x 20)
  assert.equal(fee.nights, 1);
  assert.deepEqual(fee.breakdown.days.map((day) => [day.date, day.hours, day.amount]), [['2026-05-04', 4, 110], ['2026-05-05', 8, 190]]);
  assert.equal(fee.totalAmount, 400);
});

test('each midnight adds one more night and a full day is capped at 24 hourly slots', () => {
  assert.equal(calculateFee('2026-05-04T20:00:00+07:00', '2026-05-05T22:00:00+07:00', carRules).totalAmount, 680);

  // วันแรก 16 ชม. = 350, วันกลางเต็มวัน 24 ชม. = 510, วันสุดท้าย 9 ชม. = 210, ค่าปรับ 2 คืน = 200
  const fee = calculateFee('2026-05-04T08:00:00+07:00', '2026-05-06T09:00:00+07:00', carRules);
  assert.equal(fee.nights, 2);
  assert.equal(fee.totalAmount, 1270);
});

test('leaving exactly at midnight does not count a night', () => {
  const fee = calculateFee('2026-05-04T22:00:00+07:00', '2026-05-05T00:00:00+07:00', carRules);

  assert.equal(fee.nights, 0);
  assert.equal(fee.totalAmount, 60);
});

test('price 0 rules make hours free as configured', () => {
  assert.equal(calculateFee('2026-05-04T08:00:00+07:00', '2026-05-04T08:40:00+07:00', freeFirstHourRules).totalAmount, 0);
  assert.equal(calculateFee('2026-05-04T08:00:00+07:00', '2026-05-04T10:10:00+07:00', freeFirstHourRules).totalAmount, 20);
});

test('hours not covered by next_hour fall back to the base price instead of becoming free', () => {
  const rules = [
    { feeType: 'base_hour', vehicleType: 'car', hourStart: 1, hourEnd: 2, price: 30, status: 'active' },
    { feeType: 'next_hour', vehicleType: 'car', hourStart: 3, hourEnd: 4, price: 10, status: 'active' },
  ];

  // ชั่วโมงที่ 5-6 ไม่มี next_hour รองรับ จึงคิดราคา base: (2 x 30) + (2 x 10) + (2 x 30)
  assert.equal(calculateFee('2026-05-04T08:00:00+07:00', '2026-05-04T14:00:00+07:00', rules).totalAmount, 140);
});

test('vehicle type selects the matching rules and inactive rules are ignored', () => {
  const rules = [
    ...carRules,
    { feeType: 'base_hour', vehicleType: 'motorcycle', hourStart: 1, hourEnd: 24, price: 10, status: 'active' },
    { feeType: 'overnight_day', vehicleType: 'motorcycle', price: 999, status: 'inactive' },
  ];
  const fee = calculateFee('2026-05-04T23:00:00+07:00', '2026-05-05T01:00:00+07:00', rules, { vehicleType: 'motorcycle' });

  assert.equal(fee.totalAmount, 20);
});

test('money is rounded to 2 decimals', () => {
  const rules = [{ feeType: 'base_hour', vehicleType: 'car', hourStart: 1, hourEnd: 24, price: 10.1, status: 'active' }];

  assert.equal(calculateFee('2026-05-04T08:00:00+07:00', '2026-05-04T11:00:00+07:00', rules).totalAmount, 30.3);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
});
