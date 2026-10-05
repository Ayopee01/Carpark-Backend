/* -------------------------------------- Theme Types -------------------------------------- */

// Type theme ที่มี field ครบ
export interface NormalizedTheme {
  themeColor: string | null;
  logoUrl: string | null;
  themeMode: string;
  customThemeColor: string | null;
  updatedAt: string | undefined;
}

// Type theme ใน response พร้อม configUpdatedAt
export type ThemeResponse = NormalizedTheme & { configUpdatedAt: string | null };
