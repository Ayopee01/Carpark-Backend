// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
// Import Test Helpers
import { fixture } from '../../support/mock';
// Import Middlewares
import { authorize } from '../../../src/middlewares/permission.middleware';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function รัน authorize กับผู้ใช้ที่มี permissions ที่กำหนด แล้วคืน status ของ error (undefined = ผ่าน)
function run(required: Parameters<typeof authorize>[0], permissions: string[] | null): number | undefined {
  let statusCode: number | undefined;
  const req = fixture<Request>({ user: permissions ? { id: 'u_1', permissions } : undefined, originalUrl: '/api/test', method: 'GET' });
  const next: NextFunction = (error?: unknown) => {
    statusCode = (error as { statusCode?: number } | undefined)?.statusCode;
  };
  authorize(required)(req, fixture<Response>({}), next);
  return statusCode;
}

/* -------------------------------------- Tests -------------------------------------- */

test('authorize with an array passes when the user has any one of the permissions', (t) => {
  assert.equal(run(['dashboard', 'transactions'], ['transactions']), undefined);
  assert.equal(run(['dashboard', 'transactions'], ['dashboard']), undefined);
  assert.equal(run(['dashboard', 'transactions'], ['overview']), 403);
  assert.equal(run('dashboard', ['transactions']), 403);
  assert.equal(run('dashboard', null), 401);
  assert.equal(run(undefined, []), undefined);
});
