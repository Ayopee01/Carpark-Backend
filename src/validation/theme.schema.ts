// Import Library
import { z } from 'zod';

/* -------------------------------------- Config -------------------------------------- */

// Config theme ที่ frontend รองรับ ('' = ยังไม่เลือก, custom = ใช้สีจาก themeColor/customThemeColor)
const THEME_MODES = ['', 'theme1', 'theme2', 'theme3', 'custom'] as const;

/* -------------------------------------- Formats -------------------------------------- */

// Format สี HEX แบบ #RRGGBB หรือ null เพื่อล้างค่า
function hexColor(field: string) {
  return z.string({ error: `${field} must be a string` }).regex(/^#[0-9A-Fa-f]{6}$/, { error: `${field} must be a hex color like #1A2B3C` }).nullable().optional();
}

/* -------------------------------------- Theme Schemas -------------------------------------- */

// Schema body สำหรับแก้ไข theme (service เช็ค field ที่ส่งมาด้วย hasOwnProperty จึงไม่เติมค่า default)
// logoUrl รับแค่ null หรือไฟล์ใน /uploads/ (ชื่อไฟล์ห้ามขึ้นต้นด้วย . กัน ../ และ URL ภายนอก)
const updateThemeBodySchema = z.object({
  themeColor: hexColor('themeColor'),
  logoUrl: z.string({ error: 'logoUrl must be a string' })
    .regex(/^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/, { error: 'logoUrl must be null or an /uploads/ path' })
    .nullable()
    .optional(),
  themeMode: z.enum(THEME_MODES, { error: `themeMode must be one of ${THEME_MODES.filter(Boolean).join(', ')} or empty` }).optional(),
  customThemeColor: hexColor('customThemeColor'),
});

export { updateThemeBodySchema };
