// Import Library
import { z } from 'zod';
// Import Validation
import { nullableString } from './zod';

/* -------------------------------------- Theme Schemas -------------------------------------- */

// Schema body สำหรับแก้ไข theme (service เช็ค field ที่ส่งมาด้วย hasOwnProperty จึงไม่เติมค่า default)
// logoUrl รับแค่ null หรือไฟล์ใน /uploads/ (ชื่อไฟล์ห้ามขึ้นต้นด้วย . กัน ../ และ URL ภายนอก)
const updateThemeBodySchema = z.object({
  themeColor: nullableString('themeColor'),
  logoUrl: z.string({ error: 'logoUrl must be a string' })
    .regex(/^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/, { error: 'logoUrl must be null or an /uploads/ path' })
    .nullable()
    .optional(),
  themeMode: z.string({ error: 'themeMode must be a string' }).optional(),
  customThemeColor: nullableString('customThemeColor'),
});

export { updateThemeBodySchema };
