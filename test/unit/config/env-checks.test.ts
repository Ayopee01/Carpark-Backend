// Import Library
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
// Import Test Helpers
import { setEnv } from '../../support/mock';
// Import Utils
import { getRealtimePingIntervalMs } from '../../../src/utils/socket';

/* -------------------------------------- Config -------------------------------------- */

// Config env ที่ API บังคับตั้ง (ค่าจาก test/test.env) ส่งต่อให้ process ใหม่ แล้วแต่ละ test แทนเฉพาะค่าที่ต้องการตรวจ
const REQUIRED_ENV_KEYS = ['PORT', 'TRUST_PROXY', 'CORS_ORIGIN', 'AUTH_TOKEN_SECRET', 'REALTIME_PING_INTERVAL_MS', 'LOGIN_RATE_LIMIT', 'ACTIVATION_RATE_LIMIT', 'PUBLIC_CLIENT_RATE_LIMIT', 'DEVICE_AUTH_RATE_LIMIT', 'OMISE_CURRENCY', 'OMISE_QR_EXPIRY_MINUTES'];

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function โหลด module ใน process ใหม่ด้วย env ที่กำหนด แล้วคืนข้อความ error (ถ้ามี)
function loadWithEnv(modulePath: string, env: Record<string, string>): string | null {
  const baseEnv = Object.fromEntries(REQUIRED_ENV_KEYS.map((key) => [key, process.env[key] ?? '']));
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(modulePath)})`], {
    cwd: `${__dirname}/../../..`,
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

test('required secret and CORS origin must be set', () => {
  assert.match(loadWithEnv('./src/utils/crypto', { AUTH_TOKEN_SECRET: '' }) ?? '', /AUTH_TOKEN_SECRET is required/);
  assert.match(loadWithEnv('./src/app', { CORS_ORIGIN: '' }) ?? '', /CORS_ORIGIN is required/);
  assert.equal(loadWithEnv('./src/app', {}), null);
});

test('production with an Omise secret key requires a webhook secret', () => {
  const env = { NODE_ENV: 'production', OMISE_SECRET_KEY: 'skey_test_x' };

  assert.match(loadWithEnv('./src/services/shared/omise-api.service', env) ?? '', /OMISE_WEBHOOK_SECRET is required/);
  assert.equal(loadWithEnv('./src/services/shared/omise-api.service', { ...env, OMISE_WEBHOOK_SECRET: 'whsec' }), null);
});

test('realtime ping interval is read from REALTIME_PING_INTERVAL_MS', (t) => {
  setEnv(t, { REALTIME_PING_INTERVAL_MS: '25000' });

  assert.equal(getRealtimePingIntervalMs(), 25000);
});
