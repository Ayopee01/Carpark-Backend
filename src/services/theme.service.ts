// Import Repositories
import * as configRepository from '../repositories/config.repository';
// Import Types
import type { ThemeConfig, WithConfigMeta } from '../types/shared/config.type';
import type { NormalizedTheme, ThemeResponse } from '../types/theme.type';
// Import Validation
import { parseWithSchema } from '../validation/zod';
import { updateThemeBodySchema } from '../validation/theme.schema';
// Import Utils
import { ApiError } from '../utils/api-error';
import { appEvents } from '../utils/events';
import { deleteUploadedFile } from '../utils/uploads';

/* -------------------------------------- Helpers -------------------------------------- */

// Function ทำให้ theme มี field ครบและเป็นรูปแบบเดียวกันทุกครั้ง
function normalizeTheme(theme: Partial<ThemeConfig> | null | undefined): NormalizedTheme {
  return {
    themeColor: theme?.themeColor ?? null,
    logoUrl: theme?.logoUrl ?? null,
    themeMode: theme?.themeMode ?? '',
    customThemeColor: theme?.customThemeColor ?? null,
    updatedAt: theme?.updatedAt,
  };
}

// Function แปลง theme เป็น response พร้อม configUpdatedAt
function toThemeResponse(theme: Partial<WithConfigMeta<ThemeConfig>> | null | undefined): ThemeResponse {
  return { ...normalizeTheme(theme), configUpdatedAt: theme?.configUpdatedAt ?? null };
}

// Function ดึง theme ปัจจุบันที่มี field ครบ
async function getCurrentTheme(): Promise<NormalizedTheme> {
  return normalizeTheme(await configRepository.getConfig('theme'));
}

// Function บันทึก theme พร้อม updatedAt แล้วแจ้ง client SSE ให้เปลี่ยน theme ทันที
async function saveTheme(theme: Pick<ThemeConfig, 'themeColor' | 'logoUrl' | 'themeMode' | 'customThemeColor'>): Promise<WithConfigMeta<ThemeConfig>> {
  const saved = await configRepository.setConfig('theme', { ...theme, updatedAt: new Date().toISOString() });
  appEvents.emit('theme_updated', saved);
  return saved;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง theme พร้อม configUpdatedAt
async function getTheme(): Promise<ThemeResponse> {
  const theme = await configRepository.getConfigWithMeta('theme');
  return toThemeResponse(theme);
}

// Function แก้ไข theme (themeMode custom จะใช้ themeColor เป็น customThemeColor ด้วย)
async function updateTheme(body: unknown): Promise<{ message: string; theme: ThemeResponse }> {
  const data = parseWithSchema(updateThemeBodySchema, body) as Partial<Record<'themeColor' | 'logoUrl' | 'themeMode' | 'customThemeColor', string | null>>;
  const current = await getCurrentTheme();
  const has = (field: keyof typeof data): boolean => Object.prototype.hasOwnProperty.call(data, field);

  const themeMode = has('themeMode') ? data.themeMode ?? '' : current.themeMode;
  const customThemeColor = has('customThemeColor')
    ? data.customThemeColor ?? null
    : themeMode === 'custom' && has('themeColor') ? data.themeColor ?? null : current.customThemeColor;
  const themeColor = has('themeColor')
    ? data.themeColor ?? null
    : themeMode === 'custom' && customThemeColor ? customThemeColor : current.themeColor;

  const saved = await saveTheme({
    themeColor,
    logoUrl: has('logoUrl') ? data.logoUrl ?? null : current.logoUrl,
    themeMode,
    customThemeColor,
  });
  return { message: 'Theme updated', theme: toThemeResponse(saved) };
}

// Function บันทึก logo ที่ upload แล้วลบไฟล์ logo เดิม
async function uploadLogo(file: { filename: string } | null | undefined): Promise<{ message: string; logoUrl: string; theme: ThemeResponse }> {
  if (!file) throw new ApiError(400, 'LOGO_FILE_REQUIRED', 'Please upload a file');

  const logoUrl = `/uploads/${file.filename}`;
  try {
    const current = await getCurrentTheme();
    const saved = await saveTheme({ ...current, logoUrl });
    deleteUploadedFile(current.logoUrl);
    return { message: 'Logo uploaded successfully', logoUrl, theme: toThemeResponse(saved) };
  } catch (err) {
    deleteUploadedFile(logoUrl);
    throw err;
  }
}

// Function ลบ logo และตั้ง logoUrl เป็น null
async function deleteLogo(): Promise<{ message: string; theme: ThemeResponse }> {
  const current = await getCurrentTheme();
  const saved = await saveTheme({ ...current, logoUrl: null });
  deleteUploadedFile(current.logoUrl);
  return { message: 'Logo deleted and reset successfully', theme: toThemeResponse(saved) };
}

export { deleteLogo, getTheme, updateTheme, uploadLogo };
