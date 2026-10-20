// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture } from '../support/mock';
// Import Repositories
import * as configRepository from '../../src/repositories/config.repository';
// Import Types
import type { DbClient } from '../../src/types/shared/common.type';

/* -------------------------------------- Tests -------------------------------------- */

test('updateConfig creates the default row before locking so a database without seed still has payment settings', async () => {
  const calls: string[] = [];
  let stored: { key: string; data: unknown; updatedAt: Date } | null = null;
  const connection = fixture<DbClient>({
    appConfig: {
      createMany: async ({ data, skipDuplicates }: { data: { key: string; data: unknown }[]; skipDuplicates: boolean }) => {
        calls.push(`createMany:${skipDuplicates}`);
        if (!stored) stored = { ...data[0]!, updatedAt: new Date('2026-10-08T00:00:00Z') };
        return { count: 1 };
      },
      findUnique: async () => stored,
      upsert: async ({ update }: { update: { data: unknown } }) => ({ ...stored, data: update.data, updatedAt: new Date('2026-10-08T00:01:00Z') }),
    },
    $queryRaw: async () => {
      calls.push('lock');
      return [];
    },
  });

  let seen: string[] = [];
  await configRepository.updateConfig('payment_settings', (settings) => {
    seen = settings.methods.map((method) => method.id);
    return undefined;
  }, connection);

  // สร้าง row ก่อนล็อก และไม่ทับ row เดิมถ้ามีอยู่แล้ว
  assert.deepEqual(calls, ['createMany:true', 'lock']);
  assert.deepEqual(seen, ['cash', 'qr', 'promptpay', 'card', 'mobile_banking', 'bank1', 'wallet', 'other']);
});

test('updateConfig shows a row it just created with updatedAt null so configUpdatedAt null from GET is not a conflict', async () => {
  const savedAt = new Date('2026-10-08T00:00:00Z');
  let created = false;
  const connection = fixture<DbClient>({
    appConfig: {
      createMany: async () => {
        const count = created ? 0 : 1;
        created = true;
        return { count };
      },
      findUnique: async ({ where }: { where: { key: string } }) => ({ key: where.key, data: { pricingRules: [] }, updatedAt: savedAt }),
    },
    $queryRaw: async () => [],
  });

  const seen: (Date | null)[] = [];
  const read = (_data: unknown, record: { updatedAt: Date | null }) => {
    seen.push(record.updatedAt);
    return undefined;
  };
  await configRepository.updateConfig('pricing_config', read, connection);
  await configRepository.updateConfig('pricing_config', read, connection);

  // ครั้งแรกเพิ่งสร้าง row ครั้งที่สองเป็น row เดิมที่บันทึกแล้ว
  assert.deepEqual(seen, [null, savedAt]);
});
