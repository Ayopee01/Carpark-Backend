// Import Library
import { z } from 'zod';
// Import Validation
import { configObject, moneyAmount, nullableString } from './zod';
// Import Utils
import { FEE_TYPES, HOURS_PER_DAY } from '../utils/pricing';
import { VEHICLE_TYPES } from '../utils/vehicle';

/* -------------------------------------- Formats -------------------------------------- */

// Format ชั่วโมงของวันเป็นจำนวนเต็ม 1-24 (รับ string ตัวเลขจาก form ได้)
function hourNumber(field: string) {
  const message = `${field} must be an integer between 1 and ${HOURS_PER_DAY}`;
  return z.union([z.number(), z.string().trim().regex(/^\d+$/, { error: message })], { error: message })
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= HOURS_PER_DAY, { error: message });
}

// Format field ของ pricing rule
const pricingRuleFields = {
  id: z.string({ error: 'id must be a string' }).optional(),
  name: nullableString('name'),
  feeType: z.enum(FEE_TYPES, { error: `feeType must be one of ${FEE_TYPES.join(', ')}` }).optional(),
  vehicleType: z.enum(VEHICLE_TYPES, { error: `vehicleType must be one of ${VEHICLE_TYPES.join(', ')}` }).optional(),
  price: moneyAmount('price').optional(),
  baseHours: hourNumber('baseHours').optional(),
  hourStart: hourNumber('hourStart').optional(),
  hourEnd: hourNumber('hourEnd').nullable().optional(),
  status: z.string({ error: 'status must be a string' }).optional(),
};

/* -------------------------------------- Pricing Schemas -------------------------------------- */

// Schema pricing rule หนึ่งรายการใน PUT (price บังคับ เพราะ PUT แทนที่ rule ทั้งชุด)
const pricingRuleBodySchema = configObject('pricing rule', {
  ...pricingRuleFields,
  price: z.unknown()
    .refine((value) => value !== undefined && value !== null, { error: 'price is required', abort: true })
    .pipe(moneyAmount('price')),
});

// Schema body สำหรับแก้ไข pricing config ทั้งชุด (configUpdatedAt จาก GET ใช้ตรวจว่ามีคนอื่นแก้ไปก่อนหรือไม่)
const updatePricingConfigBodySchema = configObject('body', {
  configUpdatedAt: z.string({ error: 'configUpdatedAt must be a string' }).nullable().optional(),
  pricingRules: z.array(pricingRuleBodySchema, { error: 'pricingRules must be an array' }).optional(),
  paymentChannels: z.array(z.unknown(), { error: 'paymentChannels must be an array' }).optional(),
  serviceChannelMapping: z.array(z.unknown(), { error: 'serviceChannelMapping must be an array' }).optional(),
  masterData: configObject('masterData').optional(),
});

export { pricingRuleBodySchema, updatePricingConfigBodySchema };
