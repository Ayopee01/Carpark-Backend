/* -------------------------------------- Theme Types -------------------------------------- */

// Type theme ที่มี field ครบ (updatedAt เป็น null จนกว่าจะบันทึก theme ครั้งแรก)
export interface NormalizedTheme {
  themeColor: string | null;
  logoUrl: string | null;
  themeMode: string;
  customThemeColor: string | null;
  updatedAt: string | null;
}

// Type theme ใน response พร้อม configUpdatedAt
export type ThemeResponse = NormalizedTheme & { configUpdatedAt: string | null };
