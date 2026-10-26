// Import Library
import type { Prisma } from '@prisma/client';
// Import Config
import { withTransaction } from '../../db/prisma';
// Import Repositories
import { client } from './repository-utils';
// Import Types
import type { DbClient } from '../../types/shared/common.type';
import type { AppConfigKey, AppConfigMap, ConfigRecord, ConfigUpdater, WithConfigMeta } from '../../types/shared/config.type';

/* -------------------------------------- Config -------------------------------------- */

// Config ค่า default ของแต่ละ key ใน app_config ใช้เมื่อยังไม่มี record (ราคาไม่มี default ต้องตั้งจริงหรือใช้ราคาตัวอย่างจาก seed)
const APP_CONFIG_DEFAULTS: AppConfigMap = {
  devices: {
    summary: { totalDevices: 0, online: 0, offline: 0 },
    devices: [],
    masterData: {
      deviceTypes: [
        { code: 'printer', label: 'Printer' },
        { code: 'lpr', label: 'LPR Camera' },
        { code: 'barrier_gate', label: 'Barrier Gate' },
        { code: 'kiosk', label: 'Kiosk' },
      ],
      connectionTypes: [
        { code: 'usb', label: 'USB' },
        { code: 'lan', label: 'LAN' },
        { code: 'wifi', label: 'Wi-Fi' },
      ],
    },
  },
  payment_settings: {
    methods: [
      { id: 'cash', label: 'Cash', icon: 'cash', isActive: true },
      { id: 'qr', label: 'QR Payment', icon: 'qr', isActive: true },
      { id: 'promptpay', label: 'PromptPay', icon: 'qr', isActive: true },
      { id: 'card', label: 'Credit/Debit Card', icon: 'card', isActive: true },
      { id: 'mobile_banking', label: 'Mobile Banking', icon: 'bank', isActive: true },
      { id: 'bank1', label: 'Bank Account 1', icon: 'bank', isActive: true },
      { id: 'wallet', label: 'Wallet', icon: 'wallet', isActive: true },
      { id: 'other', label: 'Other', icon: 'more', isActive: true },
    ],
    channels: [
      { id: 'ch_cashier', name: 'Cashier', icon: 'user', allowedMethods: ['cash', 'qr', 'promptpay', 'card', 'mobile_banking', 'bank1', 'wallet', 'other'] },
      { id: 'ch_kiosk', name: 'Kiosk', icon: 'vending', allowedMethods: ['qr', 'promptpay', 'card', 'mobile_banking', 'bank1', 'wallet'] },
      { id: 'ch_mobile', name: 'Mobile', icon: 'qr', allowedMethods: ['qr', 'promptpay', 'mobile_banking', 'wallet'] },
      { id: 'ch_gate', name: 'Exit Gate', icon: 'gate', allowedMethods: ['wallet', 'promptpay', 'card'] },
    ],
  },
  pricing_config: {
    pricingRules: [],
    paymentChannels: [],
    serviceChannelMapping: [],
    masterData: { serviceTypes: [], vehicleTypes: [] },
  },
  system_settings: {
    general: { systemName: 'Smart Carpark', location: 'Main Building', language: 'th', timezone: 'Asia/Bangkok', frontendUrl: 'http://localhost:3000' },
    receipt: {
      entryBill: { showDate: true, showEntryTime: true, showQrCode: true, showBillNo: true },
      paymentBill: { showDate: true, showEntryTime: true, showQrCode: true, showBillNo: true, showExpiryTime: true, expiryDuration: 30 },
      printer: { fontSize: 12, billNumberFontSize: 16, paperWidth: 80 },
      footerText: 'Thank you',
    },
    billing: { taxEnabled: false, currency: 'THB', roundingMode: 'normal' },
  },
  theme: {
    themeColor: null,
    logoUrl: null,
    themeMode: '',
    customThemeColor: null,
  },
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function เพิ่ม configUpdatedAt จากเวลาแก้ไขล่าสุดของ record
function withConfigMeta<T extends object>(data: T, record: { updatedAt: Date | null } | null): WithConfigMeta<T> {
  return {
    ...data,
    configUpdatedAt: record?.updatedAt ? record.updatedAt.toISOString() : null,
  };
}

// Function ดึง record config ตาม key ถ้ายังไม่มีใช้ค่า default ของ key นั้น
async function findConfigRecord<K extends AppConfigKey>(key: K, connection?: DbClient): Promise<ConfigRecord<K>> {
  if (!key) throw new Error('config key is required');

  const record = await client(connection).appConfig.findUnique({ where: { key } });
  // ข้อมูลใน database เป็น JSON ที่ระบบเขียนเองตาม AppConfigMap จึงแปลง type ที่ขอบ repository นี้ที่เดียว
  if (record) return { key, data: record.data as unknown as AppConfigMap[K], updatedAt: record.updatedAt };
  return { key, data: structuredClone(APP_CONFIG_DEFAULTS[key]), updatedAt: null };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ตัด configUpdatedAt ออกจากข้อมูลก่อนบันทึก (คง type เดิมไว้ เพราะ config ส่วนใหญ่มี index signature ที่ Omit ทำให้ field หาย)
function stripConfigMeta<T extends object>(value: T): T {
  const { configUpdatedAt: _configUpdatedAt, ...data } = (value || {}) as T & { configUpdatedAt?: unknown };
  return data as T;
}

// Function ดึงข้อมูล config ตาม key
async function getConfig<K extends AppConfigKey>(key: K, connection?: DbClient): Promise<AppConfigMap[K]> {
  const record = await findConfigRecord(key, connection);
  return record.data;
}

// Function ดึงข้อมูล config ตาม key พร้อม configUpdatedAt
async function getConfigWithMeta<K extends AppConfigKey>(key: K, connection?: DbClient): Promise<WithConfigMeta<AppConfigMap[K]>> {
  const record = await findConfigRecord(key, connection);
  return withConfigMeta(record.data, record);
}

// Function บันทึก config ตาม key (สร้างใหม่ถ้ายังไม่มี) คืนข้อมูลพร้อม configUpdatedAt
async function setConfig<K extends AppConfigKey>(key: K, value: AppConfigMap[K], connection?: DbClient): Promise<WithConfigMeta<AppConfigMap[K]>> {
  if (!key) throw new Error('config key is required');

  const data = stripConfigMeta(value) as unknown as Prisma.InputJsonValue;
  const record = await client(connection).appConfig.upsert({
    where: { key },
    create: { key, data },
    update: { data },
  });

  return withConfigMeta(record.data as unknown as AppConfigMap[K], record);
}

// Function แก้ config จากข้อมูลเดิมผ่าน updater ใน database transaction ที่ล็อก row ไว้ ถ้า updater คืน undefined จะไม่บันทึก
async function updateConfig<K extends AppConfigKey>(key: K, updater: ConfigUpdater<K>, connection?: DbClient): Promise<WithConfigMeta<AppConfigMap[K]>> {
  if (!connection) return withTransaction((tx) => updateConfig(key, updater, tx));

  // สร้าง row จากค่า default ก่อนถ้ายังไม่มี (ไม่เปลี่ยน updatedAt ของ row เดิม) เพื่อให้มี row ให้ล็อกเสมอ
  const { count: created } = await client(connection).appConfig.createMany({ data: [{ key, data: structuredClone(APP_CONFIG_DEFAULTS[key]) as unknown as Prisma.InputJsonValue }], skipDuplicates: true });
  // ล็อก row ของ key จนจบ transaction ให้ updater ทำต่อกันทีละ request (กัน heartbeat เขียนทับการแก้ไขของ Admin)
  await client(connection).$queryRaw`SELECT key FROM app_config WHERE key = ${key} FOR UPDATE`;
  const record = await findConfigRecord(key, connection);
  // row ที่เพิ่งสร้างยังไม่เคยถูกบันทึก updater จึงเห็น updatedAt เป็น null เหมือนตอน GET (กัน 409 ของ configUpdatedAt: null)
  const nextData = await updater(record.data, created ? { ...record, updatedAt: null } : record);
  if (nextData === undefined) return withConfigMeta(record.data, record);

  return setConfig(key, nextData, connection);
}

export { getConfig, getConfigWithMeta, setConfig, stripConfigMeta, updateConfig };
