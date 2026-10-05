// Import Library
import { z } from 'zod';
// Import Validation
import { configObject, nullableString, stringArray } from './zod';

/* -------------------------------------- Payment Settings Schemas -------------------------------------- */

// Schema body สำหรับแก้ไข payment method (id ใน body ถูกเมินเพื่อไม่ให้ mapping ของ channel เสีย)
const updateMethodBodySchema = configObject('body', {
  label: z.string({ error: 'label must be a string' }).trim().min(1, 'label must not be empty').optional(),
  icon: nullableString('icon'),
  isActive: z.boolean({ error: 'isActive must be a boolean' }).optional(),
});

// Schema body สำหรับแก้ไข method ที่อนุญาตใน channel
const updateChannelBodySchema = z.object({
  allowedMethods: stringArray('allowedMethods'),
});

export { updateChannelBodySchema, updateMethodBodySchema };
