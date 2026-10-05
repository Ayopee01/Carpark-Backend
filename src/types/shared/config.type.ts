// Import Types
import type { DevicesConfig } from './device.type';

/* -------------------------------------- App Config Types -------------------------------------- */

// Type ประเภท rule ที่ใช้คิดค่าจอด
export type FeeType = 'base_hour' | 'next_hour' | 'overnight_day';

// Type pricing rule หนึ่งรายการ
export interface PricingRule {
  id: string;
  name: string;
  feeType: FeeType | string;
  vehicleType: string;
  price: number;
  status: string;
  hourStart?: number | null;
  hourEnd?: number | null;
  baseHours?: number | null;
  [key: string]: unknown;
}

// Type pricing config ที่เก็บใน app_config key pricing_config
export interface PricingConfig {
  pricingRules: PricingRule[];
  paymentChannels: unknown[];
  serviceChannelMapping: unknown[];
  masterData: Record<string, unknown>;
  [key: string]: unknown;
}

// Type payment method ใน payment settings
export interface PaymentMethodSetting {
  id: string;
  label: string;
  icon?: string | null;
  isActive?: boolean;
  [key: string]: unknown;
}

// Type payment channel ใน payment settings
export interface PaymentChannelSetting {
  id: string;
  name?: string;
  icon?: string;
  allowedMethods: string[];
  [key: string]: unknown;
}

// Type payment settings ที่เก็บใน app_config key payment_settings
export interface PaymentSettings {
  methods: PaymentMethodSetting[];
  channels: PaymentChannelSetting[];
  [key: string]: unknown;
}

// Type receipt settings
export interface ReceiptSettings {
  entryBill?: Record<string, unknown>;
  paymentBill?: { expiryDuration?: number | string; [key: string]: unknown };
  printer?: { fontSize?: number | string; billNumberFontSize?: number | string; paperWidth?: number | string; [key: string]: unknown };
  paperWidth?: string | number;
  footerText?: string | null;
  [key: string]: unknown;
}

// Type system settings ที่เก็บใน app_config key system_settings
export interface SystemSettings {
  general: { systemName?: string | null; location?: string | null; language?: string | null; timezone?: string | null; frontendUrl?: string | null; [key: string]: unknown };
  receipt: ReceiptSettings;
  billing: Record<string, unknown>;
  updatedAt?: string;
  [key: string]: unknown;
}

// Type theme ที่เก็บใน app_config key theme
export interface ThemeConfig {
  themeColor: string | null;
  logoUrl: string | null;
  themeMode: string;
  customThemeColor: string | null;
  updatedAt?: string;
  [key: string]: unknown;
}

// Type ข้อมูลของแต่ละ key ใน table app_config
export interface AppConfigMap {
  devices: DevicesConfig;
  payment_settings: PaymentSettings;
  pricing_config: PricingConfig;
  system_settings: SystemSettings;
  theme: ThemeConfig;
}

// Type key ของ table app_config
export type AppConfigKey = keyof AppConfigMap;

// Type ข้อมูล config พร้อมเวลาแก้ไขล่าสุด
export type WithConfigMeta<T> = T & { configUpdatedAt: string | null };

/* -------------------------------------- Config Repository Types -------------------------------------- */

// Type record config ที่อ่านได้ (ยังไม่มี record ใน database จะมี updatedAt เป็น null)
export interface ConfigRecord<K extends AppConfigKey> {
  key: K;
  data: AppConfigMap[K];
  updatedAt: Date | null;
}

// Type function ที่แก้ config จากข้อมูลเดิม คืน undefined เมื่อไม่ต้องบันทึก
export type ConfigUpdater<K extends AppConfigKey> = (data: AppConfigMap[K], record: ConfigRecord<K>) => AppConfigMap[K] | undefined | Promise<AppConfigMap[K] | undefined>;
