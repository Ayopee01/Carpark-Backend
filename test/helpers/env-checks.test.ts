// Import Library
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
// Import Test Helpers
import { setEnv } from '../support/mock';
// Import Realtime
import { getRealtimePingIntervalMs } from '../../src/realtime/sse';

/* -------------------------------------- Config -------------------------------------- */

// Config env ที่ API บังคับตั้ง (ค่าจาก test/test.env) ส่งต่อให้ process ใหม่ แล้วแต่ละ test แทนเฉพาะค่าที่ต้องการตรวจ
const REQUIRED_ENV_KEYS = ['PORT', 'TRUST_PROXY', 'CLIENT_ORIGINS', 'ADMIN_ORIGINS', 'AUTH_TOKEN_SECRET', 'REALTIME_PING_INTERVAL_MS', 'LOGIN_RATE_LIMIT', 'ACTIVATION_RATE_LIMIT', 'PUBLIC_CLIENT_RATE_LIMIT', 'OMISE_CURRENCY', 'OMISE_QR_EXPIRY_MINUTES'];

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function โหลด module ใน process ใหม่ด้วย env ที่กำหนด แล้วคืนข้อความ error (ถ้ามี)
function loadWithEnv(modulePath: string, env: Record<string, string>): string | null {
  const baseEnv = Object.fromEntries(REQUIRED_ENV_KEYS.map((key) => [key, process.env[key] ?? '']));
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(modulePath)})`], {
    cwd: `${__dirname}/../..`,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...baseEnv, ...env },
    encoding: 'utf8',
  });
  return result.status === 0 ? null : result.stderr;
}

/* -------------------------------------- Tests -------------------------------------- */

test('production rejects placeholder auth secret', () => {
  assert.match(
    loadWithEnv('./src/utils/crypto', { NODE_ENV: 'production', AUTH_TOKEN_SECRET: 'change-me' }) ?? '',
    /AUTH_TOKEN_SECRET must be set to a real secret/
  );
  assert.equal(loadWithEnv('./src/utils/crypto', { NODE_ENV: 'production', AUTH_TOKEN_SECRET: 'a-real-secret' }), null);
});

test('production payment simulation requires a token', () => {
  const env = { NODE_ENV: 'production', AUTH_TOKEN_SECRET: 'a-real-secret', ENABLE_PAYMENT_SIMULATION: 'true' };

  assert.match(loadWithEnv('./src/services/payment-gateway.service', env) ?? '', /PAYMENT_SIMULATION_TOKEN is required/);
  assert.equal(loadWithEnv('./src/services/payment-gateway.service', { ...env, PAYMENT_SIMULATION_TOKEN: 'x' }), null);
});

test('required env must be set instead of silently using defaults', () => {
  assert.match(loadWithEnv('./src/app', { TRUST_PROXY: '' }) ?? '', /TRUST_PROXY is required/);
  assert.match(loadWithEnv('./src/app', { CLIENT_ORIGINS: '' }) ?? '', /CLIENT_ORIGINS is required/);
  // ชื่อเดิมยังตั้งอยู่บน server ต้องบอกให้เปลี่ยนชื่อ ไม่อ่านแทนกันเงียบ ๆ
  assert.match(loadWithEnv('./src/app', { CLIENT_ORIGINS: '', CORS_ORIGINS: 'http://localhost:3001' }) ?? '', /CORS_ORIGINS was renamed to CLIENT_ORIGINS/);
  assert.match(loadWithEnv('./src/utils/crypto', { AUTH_TOKEN_SECRET: '' }) ?? '', /AUTH_TOKEN_SECRET is required/);
  assert.match(loadWithEnv('./src/middlewares/rate-limit.middleware', { PUBLIC_CLIENT_RATE_LIMIT: '' }) ?? '', /PUBLIC_CLIENT_RATE_LIMIT is required/);
  assert.match(loadWithEnv('./src/services/shared/omise.service', { OMISE_CURRENCY: '' }) ?? '', /OMISE_CURRENCY is required/);
  assert.match(loadWithEnv('./src/services/shared/omise.service', { OMISE_QR_EXPIRY_MINUTES: '' }) ?? '', /OMISE_QR_EXPIRY_MINUTES is required/);
  assert.equal(loadWithEnv('./src/app', {}), null);
});

test('invalid numeric env fails instead of silently using defaults', () => {
  assert.match(loadWithEnv('./src/middlewares/rate-limit.middleware', { LOGIN_RATE_LIMIT: 'ten' }) ?? '', /LOGIN_RATE_LIMIT must be a positive integer/);
  assert.match(loadWithEnv('./src/app', { TRUST_PROXY: 'abc' }) ?? '', /TRUST_PROXY must be an integer/);
});

test('Omise QR expiry must be 1 to 1440 minutes', () => {
  assert.match(loadWithEnv('./src/services/shared/omise.service', { OMISE_QR_EXPIRY_MINUTES: '0' }) ?? '', /OMISE_QR_EXPIRY_MINUTES must be an integer between 1 and 1440/);
  assert.equal(loadWithEnv('./src/services/shared/omise.service', { OMISE_QR_EXPIRY_MINUTES: '10' }), null);
});

test('production with an Omise secret key requires a webhook secret', () => {
  const env = { NODE_ENV: 'production', OMISE_SECRET_KEY: 'skey_test_x' };

  assert.match(loadWithEnv('./src/services/shared/omise.service', env) ?? '', /OMISE_WEBHOOK_SECRET is required/);
  assert.equal(loadWithEnv('./src/services/shared/omise.service', { ...env, OMISE_WEBHOOK_SECRET: 'whsec' }), null);
});

test('realtime ping interval is required and must be a positive integer', (t) => {
  setEnv(t, { REALTIME_PING_INTERVAL_MS: undefined });

  assert.throws(() => getRealtimePingIntervalMs(), /REALTIME_PING_INTERVAL_MS is required/);
  process.env.REALTIME_PING_INTERVAL_MS = '25s';
  assert.throws(() => getRealtimePingIntervalMs(), /must be a positive integer/);
  process.env.REALTIME_PING_INTERVAL_MS = '25000';
  assert.equal(getRealtimePingIntervalMs(), 25000);
});
