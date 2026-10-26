// Import Library
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
// Import Services
import * as omiseApiService from '../../../src/services/shared/omise-api.service';

/* -------------------------------------- Tests -------------------------------------- */

test('converts baht amounts to Omise minor currency units', () => {
  assert.equal(omiseApiService.toMinorAmount(40), 4000);
  assert.equal(omiseApiService.toMinorAmount(40.25), 4025);
  assert.throws(() => omiseApiService.toMinorAmount(0), { code: 'INVALID_PAYMENT_AMOUNT' });
});

test('verifies Omise webhook signatures with configured secret', (t) => {
  const originalSecret = process.env.OMISE_WEBHOOK_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.OMISE_WEBHOOK_SECRET;
    else process.env.OMISE_WEBHOOK_SECRET = originalSecret;
  });

  const secret = crypto.randomBytes(32);
  const timestamp = '2026-06-24T10:00:00Z';
  const rawBody = '{"key":"charge.complete"}';
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64');
  process.env.OMISE_WEBHOOK_SECRET = secret.toString('base64');

  assert.equal(omiseApiService.verifyWebhookSignature(rawBody, { 'omise-signature': `v1=${signature}`, 'omise-signature-timestamp': timestamp }), true);
  assert.equal(omiseApiService.verifyWebhookSignature(rawBody, { 'omise-signature': 'v1=invalid', 'omise-signature-timestamp': timestamp }), false);
});

test('keeps the Omise error code when wrapping Omise API errors', () => {
  const error = omiseApiService.toOmiseApiError({ object: 'error', code: 'invalid_source', message: 'source is invalid', location: '/charges' });

  assert.equal(error.statusCode, 400);
  assert.equal(error.code, 'invalid_source');
  assert.deepEqual(error.details, { provider: 'omise', location: '/charges' });
});

test('accepts only Omise charge/source document paths', () => {
  assert.equal(omiseApiService.normalizeDocumentPath('/charges/chrg_1/documents/docu_1'), '/charges/chrg_1/documents/docu_1');
  assert.equal(omiseApiService.normalizeDocumentPath('https://api.omise.co/sources/src_1/documents/docu_1'), '/sources/src_1/documents/docu_1');
  assert.equal(omiseApiService.normalizeDocumentPath('/charges/chrg_1/documents/docu_1/downloads/63A9'), '/charges/chrg_1/documents/docu_1/downloads/63A9');
  assert.throws(() => omiseApiService.normalizeDocumentPath('https://example.com/sources/src_1/documents/docu_1'), /Invalid Omise document URL/);
  assert.throws(() => omiseApiService.normalizeDocumentPath('/customers/cust_1'), /Invalid Omise document path/);
});
