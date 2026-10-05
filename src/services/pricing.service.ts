// Import Repositories
import * as configRepository from '../repositories/config.repository';
// Import Types
import type { MutationResult, PricingRuleInput } from '../types/pricing.type';
import type { PricingConfig, PricingRule } from '../types/shared/config.type';
// Import Validation
import { parseWithSchema } from '../validation/zod';
import { updatePricingConfigBodySchema } from '../validation/pricing.schema';
// Import Utils
import { ApiError } from '../utils/api-error';
import { createId } from '../utils/id';
import { HOURS_PER_DAY, roundMoney } from '../utils/pricing';
import { VEHICLE_TYPES, isVehicleType } from '../utils/vehicle';

/* -------------------------------------- Helpers -------------------------------------- */

// Config field ของ pricing rule รูปแบบเก่าที่ไม่ใช้แล้ว (ค่าปรับรายสัปดาห์/เดือน/ปี และโหมด flat)
const OBSOLETE_RULE_FIELDS = ['periodUnit', 'periodStart', 'periodEnd', 'chargeMode', 'calculationMode', 'mode'];

// Function แปลงค่าเป็น number คืน null ถ้าไม่มีค่าหรือแปลงไม่ได้
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Function รวม pricing rule ใหม่กับของเดิม เติมค่า default ตาม feeType และตัด field รูปแบบเก่าออก
function normalizePricingRule(payload: PricingRuleInput = {}, current: PricingRuleInput = {}): PricingRule {
  const merged: PricingRuleInput = { ...current, ...payload };
  const feeType = String(merged.feeType || 'base_hour');
  const rule: PricingRule = {
    ...merged,
    id: String(current.id || payload.id || createId('pr')),
    name: String(merged.name || feeType),
    feeType,
    vehicleType: isVehicleType(merged.vehicleType) ? merged.vehicleType : 'car',
    price: roundMoney(toNumberOrNull(merged.price) ?? 0),
    status: String(merged.status || 'active'),
  };
  OBSOLETE_RULE_FIELDS.forEach((field) => delete rule[field]);

  if (feeType === 'base_hour') {
    // base_hour เริ่มชั่วโมงที่ 1 เสมอ baseHours เก็บไว้ให้ตรงกับ hourEnd เพื่อรองรับ frontend เดิม
    const hourEnd = toNumberOrNull(payload.hourEnd ?? payload.baseHours ?? current.hourEnd ?? current.baseHours) ?? 1;
    return { ...rule, hourStart: 1, hourEnd, baseHours: hourEnd };
  }

  delete rule.baseHours;
  if (feeType === 'next_hour') {
    return { ...rule, hourStart: toNumberOrNull(merged.hourStart), hourEnd: toNumberOrNull(merged.hourEnd) };
  }

  delete rule.hourStart;
  delete rule.hourEnd;
  return rule;
}

// Function ตรวจช่วงชั่วโมงของ rule ที่ active ในแต่ละประเภทรถตามกติกา base_hour/next_hour/overnight_day
// ผิดกติกา throw INVALID_PRICING_RULES พร้อม vehicleType, ruleIndexes (index ใน pricingRules ที่ส่งมา) และ ruleIds (null = rule ใหม่ที่ไม่ได้ส่ง id)
function assertValidPricingRules(rules: PricingRule[] = [], inputIds: (string | null)[] = rules.map((rule) => rule.id)): PricingRule[] {
  const fail = (vehicleType: string, message: string, invalidRules: PricingRule[]): never => {
    const ruleIndexes = invalidRules.map((rule) => rules.indexOf(rule));
    throw new ApiError(400, 'INVALID_PRICING_RULES', `${message} (rules: ${invalidRules.map((rule) => rule.name).join(', ')})`, {
      vehicleType,
      ruleIndexes,
      ruleIds: ruleIndexes.map((index) => inputIds[index] ?? null),
    });
  };
  const activeRules = rules.filter((rule) => rule.status === 'active');

  VEHICLE_TYPES.forEach((vehicleType) => {
    const vehicleRules = activeRules.filter((rule) => (rule.vehicleType || 'car') === vehicleType);
    const baseRules = vehicleRules.filter((rule) => rule.feeType === 'base_hour');
    const overnightRules = vehicleRules.filter((rule) => rule.feeType === 'overnight_day');
    const nextRules = vehicleRules.filter((rule) => rule.feeType === 'next_hour').sort((a, b) => (a.hourStart ?? 0) - (b.hourStart ?? 0));
    if (baseRules.length > 1) fail(vehicleType, `${vehicleType} can have only one active base_hour`, baseRules);
    if (overnightRules.length > 1) fail(vehicleType, `${vehicleType} can have only one active overnight_day`, overnightRules);

    const baseRule = baseRules[0];
    const baseEnd = baseRule?.hourEnd ?? 0;
    if (baseRule && (!Number.isInteger(baseEnd) || baseEnd < 1 || baseEnd > HOURS_PER_DAY)) {
      fail(vehicleType, `${vehicleType} base_hour must cover hour 1 up to hour ${HOURS_PER_DAY}`, [baseRule]);
    }
    if (baseRule && nextRules.length && baseEnd >= HOURS_PER_DAY) {
      fail(vehicleType, `${vehicleType} next_hour is not allowed when base_hour covers hour ${HOURS_PER_DAY}`, [baseRule, ...nextRules]);
    }

    let previous: PricingRule | null = null;
    let previousEnd = baseEnd;
    nextRules.forEach((rule) => {
      const hourEnd = rule.hourEnd ?? HOURS_PER_DAY;
      const hourStart = rule.hourStart ?? Number.NaN;
      if (!Number.isInteger(hourStart) || hourStart <= baseEnd) {
        fail(vehicleType, `${vehicleType} next_hour must start after base_hour (hour ${baseEnd + 1} or later)`, baseRule ? [rule, baseRule] : [rule]);
      }
      if (!Number.isInteger(hourEnd) || hourEnd < hourStart || hourEnd > HOURS_PER_DAY) {
        fail(vehicleType, `${vehicleType} next_hour must end between hourStart and hour ${HOURS_PER_DAY}`, [rule]);
      }
      if (previous && hourStart <= previousEnd) fail(vehicleType, `${vehicleType} next_hour ranges must not overlap`, [previous, rule]);
      previous = rule;
      previousEnd = hourEnd;
    });
  });

  return rules;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง pricing rules พร้อม configUpdatedAt
async function getPricingRules(): Promise<{ pricingRules: PricingRule[]; configUpdatedAt: string | null }> {
  const config = await configRepository.getConfigWithMeta('pricing_config');
  return {
    pricingRules: Array.isArray(config.pricingRules) ? config.pricingRules : [],
    configUpdatedAt: config.configUpdatedAt,
  };
}

// Function แก้ไข pricing config ทั้งชุด (field ที่ไม่ได้ส่งมาใช้ค่าเดิม) เพิ่ม/แก้/ลบ rule ทำด้วยการส่ง pricingRules ทั้งชุด
// ถ้าส่ง configUpdatedAt มาแล้วไม่ตรงกับที่บันทึกล่าสุด แปลว่ามีคนแก้ไปก่อน ตอบ 409 แทนการเขียนทับ
async function updatePricingConfig(body: unknown): Promise<MutationResult> {
  const parsed = parseWithSchema(updatePricingConfigBodySchema, body);
  const data = configRepository.stripConfigMeta(parsed);
  const saved = await configRepository.updateConfig('pricing_config', (current, record) => {
    const savedAt = record.updatedAt ? record.updatedAt.toISOString() : null;
    if (parsed.configUpdatedAt !== undefined && parsed.configUpdatedAt !== savedAt) {
      throw new ApiError(409, 'PRICING_CONFIG_CONFLICT', 'Pricing config was changed by someone else, reload and try again', { configUpdatedAt: savedAt });
    }
    return {
      ...current,
      ...data,
      pricingRules: Array.isArray(data.pricingRules)
        ? assertValidPricingRules(
          data.pricingRules.map((item) => normalizePricingRule(item as PricingRuleInput)),
          data.pricingRules.map((item) => (typeof (item as PricingRuleInput).id === 'string' ? String((item as PricingRuleInput).id) : null)),
        )
        : current.pricingRules,
      paymentChannels: data.paymentChannels || current.paymentChannels,
      serviceChannelMapping: data.serviceChannelMapping || current.serviceChannelMapping,
      masterData: (data.masterData as Record<string, unknown> | undefined) || current.masterData,
    } as PricingConfig;
  });
  return { success: true as const, message: 'Pricing config updated', configUpdatedAt: saved.configUpdatedAt };
}

export { getPricingRules, updatePricingConfig };
