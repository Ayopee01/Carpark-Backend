// Import Library
import type { Prisma } from '@prisma/client';
// Import Config
import { prisma, withTransaction } from '../db/prisma';
// Import Types
import type { DbClient } from '../types/shared/common.type';
import type { AppConfigKey, AppConfigMap, ConfigRecord, ConfigUpdater, WithConfigMeta } from '../types/shared/config.type';

/* -------------------------------------- Config -------------------------------------- */

// Config ค่า default ของเอกสารแต่ละ key ใน table app_config ใช้เมื่อยังไม่มี record ใน database
const APP_CONFIG_DEFAULTS: AppConfigMap = {
  devices: {
    summary: { totalDevices: 0, online: 0, offline: 0 },
    devices: [],
    masterData: { deviceTypes: [], connectionTypes: [] },
  },
  payment_settings: {
    methods: [],
    channels: [],
  },
  pricing_config: {
    pricingRules: [],
    paymentChannels: [],
    serviceChannelMapping: [],
    masterData: { serviceTypes: [], vehicleTypes: [] },
  },
  system_settings: {
    general: { systemName: null, location: null, language: null, timezone: null, frontendUrl: null },
    receipt: { paymentBill: { expiryDuration: 30 } },
    billing: {},
  },
  theme: {
    themeColor: null,
    logoUrl: null,
    themeMode: '',
    customThemeColor: null,
  },
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือก prisma client ปกติ หรือ transaction client ที่ส่งเข้ามา
function client(connection?: DbClient): DbClient {
  return connection ?? prisma;
}

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

  // ล็อก row ของ key จนจบ transaction ให้ updater ทำต่อกันทีละ request (กัน heartbeat เขียนทับการแก้ไขของ Admin)
  await client(connection).$queryRaw`SELECT key FROM app_config WHERE key = ${key} FOR UPDATE`;
  const record = await findConfigRecord(key, connection);
  const nextData = await updater(record.data, record);
  if (nextData === undefined) return withConfigMeta(record.data, record);

  return setConfig(key, nextData, connection);
}

// Function query config หนึ่ง record เพื่อตรวจว่าเชื่อมต่อ database ได้
async function pingDatabase(connection?: DbClient): Promise<void> {
  await client(connection).appConfig.findFirst({ select: { key: true } });
}

export { getConfig, getConfigWithMeta, pingDatabase, setConfig, stripConfigMeta, updateConfig };
