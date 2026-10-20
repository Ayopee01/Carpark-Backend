// Import Types
import type { FeeType } from '../types/shared/config.type';
import type { FeeRange, FeeResult, PricingRuleInput } from '../types/shared/transaction.type';
// Import Utils
import { bangkokDateToUtcIso, getBangkokParts } from './date';

/* -------------------------------------- Config -------------------------------------- */

// Config จำนวน milliseconds ต่อชั่วโมง
const HOUR_MS = 60 * 60 * 1000;

// Config จำนวนชั่วโมงสูงสุดที่คิดเงินได้ในหนึ่งวัน
const HOURS_PER_DAY = 24;

// Config ประเภท pricing rule ที่ calculateFee คำนวณได้
const FEE_TYPES: readonly FeeType[] = ['base_hour', 'next_hour', 'overnight_day'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลงค่าเป็น number ถ้าไม่ได้ให้ใช้ fallback
function toFiniteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Function อ่านชั่วโมงสุดท้ายของ rule (ไม่กำหนดหรือ 999 คือถึงชั่วโมงที่ 24 ส่วน base_hour รองรับ baseHours เดิม)
function getHourEnd(rule: PricingRuleInput, fallback = HOURS_PER_DAY): number {
  const value = rule.feeType === 'base_hour' ? rule.hourEnd ?? rule.baseHours : rule.hourEnd;
  if (value === null || value === undefined || value === 999) return fallback;
  return Math.min(HOURS_PER_DAY, toFiniteNumber(value, fallback));
}

// Function เลือก rule ที่ active และตรงประเภทรถ (rule ที่ไม่ระบุประเภทรถใช้กับทุกประเภท)
function getActiveRules(pricingRules: PricingRuleInput[] = [], vehicleType = 'car'): PricingRuleInput[] {
  return pricingRules.filter((rule) => rule.status === 'active' && (!rule.vehicleType || rule.vehicleType === vehicleType) && (FEE_TYPES as readonly string[]).includes(rule.feeType));
}

// Function แบ่งช่วงจอดเป็นรายวันตามเวลาไทย โดยตัดที่ 00:00 ของแต่ละวัน
function splitByBangkokDay(startMs: number, endMs: number): { date: string; ms: number }[] {
  const days: { date: string; ms: number }[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const { year, month, day } = getBangkokParts(new Date(cursor));
    const nextMidnight = new Date(bangkokDateToUtcIso(year, month, day + 1)).getTime();
    const segmentEnd = Math.min(endMs, nextMidnight);
    days.push({ date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, ms: segmentEnd - cursor });
    cursor = segmentEnd;
  }
  return days;
}

// Function คิดเงินรายชั่วโมงของหนึ่งวัน: base_hour ก่อน แล้ว next_hour ตามช่วง ชั่วโมงที่ไม่มี rule รองรับใช้ราคา base
function chargeDayHours(hours: number, rules: PricingRuleInput[]): FeeRange[] {
  const baseRule = rules.find((rule) => rule.feeType === 'base_hour');
  const baseEnd = baseRule ? getHourEnd(baseRule, 1) : 0;
  const basePrice = baseRule ? toFiniteNumber(baseRule.price) : 0;
  const nextRules = rules.filter((rule) => rule.feeType === 'next_hour');
  const ranges: (Omit<FeeRange, 'amount'> & { rule: PricingRuleInput | null })[] = [];

  for (let hour = 1; hour <= hours; hour += 1) {
    const nextRule = hour > baseEnd ? nextRules.find((rule) => hour >= toFiniteNumber(rule.hourStart, baseEnd + 1) && hour <= getHourEnd(rule)) : null;
    const rule = nextRule || baseRule || null;
    const pricePerHour = nextRule ? toFiniteNumber(nextRule.price) : basePrice;
    const last = ranges[ranges.length - 1];
    if (last && last.rule === rule && last.pricePerHour === pricePerHour && last.hourEnd === hour - 1) {
      last.hourEnd = hour;
      last.hours += 1;
    } else {
      ranges.push({ rule, feeType: rule?.feeType || null, ruleId: rule?.id || null, hourStart: hour, hourEnd: hour, hours: 1, pricePerHour });
    }
  }

  return ranges.map(({ rule, ...range }) => ({ ...range, amount: roundMoney(range.hours * range.pricePerHour) }));
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ปัดยอดเงินเป็นทศนิยม 2 ตำแหน่ง
function roundMoney(value: unknown): number {
  return Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100;
}

// Function คำนวณค่าจอด: แต่ละวัน (ตัด 00:00 เวลาไทย) นับชั่วโมงใหม่จาก base_hour และทุกเที่ยงคืนที่ผ่านบวกค่าปรับ overnight_day
function calculateFee(
  entryAt: string | Date | null | undefined,
  exitAt: string | Date | null | undefined,
  pricingRules: PricingRuleInput[] = [],
  { vehicleType = 'car' }: { vehicleType?: string } = {}
): FeeResult {
  const start = new Date(entryAt ?? Number.NaN);
  const end = exitAt ? new Date(exitAt) : new Date();
  const durationMs = end.getTime() - start.getTime();
  const empty: FeeResult = { totalHours: 0, totalAmount: 0, durationMs: 0, nights: 0, breakdown: { days: [], overnight: null } };
  if (!entryAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || durationMs <= 0) return empty;

  const rules = getActiveRules(pricingRules, vehicleType);
  const days = splitByBangkokDay(start.getTime(), end.getTime()).map((day) => {
    // เศษของชั่วโมงในแต่ละวันปัดขึ้นเป็นชั่วโมงเต็ม
    const hours = Math.min(HOURS_PER_DAY, Math.ceil(day.ms / HOUR_MS));
    const ranges = chargeDayHours(hours, rules);
    return { date: day.date, hours, amount: roundMoney(ranges.reduce((sum, range) => sum + range.amount, 0)), ranges };
  });

  const nights = days.length - 1;
  const overnightRule = rules.find((rule) => rule.feeType === 'overnight_day');
  const pricePerNight = overnightRule ? toFiniteNumber(overnightRule.price) : 0;
  const overnight = nights > 0 ? { ruleId: overnightRule?.id || null, nights, pricePerNight, amount: roundMoney(nights * pricePerNight) } : null;

  return {
    totalHours: days.reduce((sum, day) => sum + day.hours, 0),
    totalAmount: roundMoney(days.reduce((sum, day) => sum + day.amount, 0) + (overnight?.amount || 0)),
    durationMs,
    nights,
    breakdown: { days, overnight },
  };
}

export { FEE_TYPES, HOURS_PER_DAY, calculateFee, roundMoney };
