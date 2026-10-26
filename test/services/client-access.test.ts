// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Transaction } from '@prisma/client';
// Import Test Helpers
import { stubRegisteredDevices } from '../support/device';
import { fixture, setEnv, stub } from '../support/mock';
// Import Middlewares
import { errorHandler } from '../../src/middlewares/error.middleware';
// Import Repositories
import * as chargeRepository from '../../src/repositories/shared/charge.repository';
// Import Routes
import clientRoutes from '../../src/routes/client.routes';
// Import Services
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';
import * as omiseApiService from '../../src/services/shared/omise-api.service';
import * as paymentSelectionService from '../../src/services/shared/payment-selection.service';
import * as transactionLookupService from '../../src/services/shared/transaction-lookup.service';
import * as transactionPaymentService from '../../src/services/shared/transaction-payment.service';
// Import Types
import type { CreateChargeInput, GatewayChargeApi, GatewayChargeInput } from '../../src/types/shared/payment.type';
import type { TransactionApi } from '../../src/types/shared/transaction.type';
// Import Utils
import { createId } from '../../src/utils/id';

/* -------------------------------------- Types -------------------------------------- */

// Type request ที่ส่งเข้า client API ใน test (ip = X-Forwarded-For แยกตัวนับ rate limit ของแต่ละ test)
interface ClientRequest {
  method?: string;
  body?: unknown;
  ip: string;
  kiosk?: boolean;
}

// Type response ที่อ่าน JSON แล้ว
interface ClientResponse {
  status: number;
  headers: Headers;
  body: Record<string, unknown>;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Config รูปแบบ UUID v4 (สุ่ม 122 bit) ของ transaction id
const UUID_V4_ID = /^t_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Function สร้าง transaction ที่ยังจ่ายได้ (ค้าง 40 บาท)
function openTransaction(overrides: Partial<TransactionApi> = {}): TransactionApi {
  const id = overrides.id ?? createId('t');
  return fixture<TransactionApi>({ id, billNo: 'PK202610260001', plateNo: 'กข1234กรุงเทพมหานคร', vehicleType: 'car', status: 'pending', exitAt: null, netAmount: 40, totalPaid: 0, remainingAmount: 40, qrData: `https://pay.example.com/payment?tx=${id}`, ...overrides });
}

// Function mock การหา transaction, Omise และการบันทึก charge คืน charge ที่ส่งไป Omise และที่บันทึก
function mockChargeFlow(t: TestContext, transactions: TransactionApi[]): { created: CreateChargeInput[]; saved: GatewayChargeInput[] } {
  const created: CreateChargeInput[] = [];
  const saved: GatewayChargeInput[] = [];
  stub(t, deviceRegistryService, { updateRegisteredDeviceHeartbeat: async () => null });
  stub(t, transactionLookupService, {
    getTransactionApiById: async (id) => transactions.find((transaction) => transaction.id === id) ?? null,
    lookupTransactionApiByPlateNo: async () => ({ matchType: 'single', transaction: transactions[0] }),
  });
  stub(t, paymentSelectionService, { assertPaymentSelection: async () => ({ ok: true }) });
  stub(t, omiseApiService, {
    createCharge: async (payload) => {
      created.push(payload);
      return { id: `chrg_test_${created.length}`, status: 'pending', amount: omiseApiService.toMinorAmount(payload.amount), currency: 'thb', metadata: payload.metadata, source: { scannable_code: { image: { download_uri: 'https://api.omise.co/documents/docu_1/download' } } } };
    },
    downloadDocument: async () => ({ contentType: 'image/png', body: Buffer.from('png') }),
  });
  stub(t, chargeRepository, {
    listPendingGatewayChargesByTransactionId: async () => [],
    createGatewayCharge: async (data) => (saved.push(data), fixture<GatewayChargeApi>({ id: 'pgc_1', provider: 'omise', processedAt: null, ...data })),
    getGatewayChargeByChargeId: async (chargeId) => {
      const data = saved.find((charge) => charge.chargeId === chargeId);
      return data ? fixture<GatewayChargeApi>({ id: 'pgc_1', provider: 'omise', processedAt: null, ...data }) : null;
    },
  });
  return { created, saved };
}

// Function mock device auth ให้ Kiosk K-1 ที่ส่ง token kiosk-token ผ่าน
function mockKioskAuth(t: TestContext): void {
  setEnv(t, { REQUIRE_DEVICE_ALLOWED_IPS: undefined });
  stubRegisteredDevices(t, { 'K-1': { token: 'kiosk-token', deviceName: 'Kiosk 1' } });
}

// Function เปิด client API (/api/client) บน port สุ่มแล้วคืน function ส่ง request (ปิด server ตอนจบ test)
async function startClientApi(t: TestContext): Promise<(path: string, request: ClientRequest) => Promise<ClientResponse>> {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.body ??= {};
    next();
  });
  app.use('/api/client', clientRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/client`;

  return async (path, { method = 'GET', body, ip, kiosk = false }) => {
    const headers: Record<string, string> = { 'X-Forwarded-For': ip };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (kiosk) Object.assign(headers, { 'X-Device-Id': 'K-1', 'X-Device-Token': 'kiosk-token' });
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    return { status: res.status, headers: res.headers, body: isJson ? ((await res.json()) as Record<string, unknown>) : {} };
  };
}

/* -------------------------------------- Tests -------------------------------------- */

test('mobile cannot look up transactions by plate number, kiosk still can', async (t) => {
  const transaction = openTransaction();
  mockChargeFlow(t, [transaction]);
  mockKioskAuth(t);
  const request = await startClientApi(t);
  const path = `/transactions?plateNo=${encodeURIComponent(transaction.plateNo)}`;

  const mobile = await request(path, { ip: '198.51.100.1' });
  const kiosk = await request(path, { ip: '198.51.100.1', kiosk: true });

  assert.deepEqual([mobile.status, mobile.body.code, mobile.body.transactionId], [403, 'MOBILE_PLATE_LOOKUP_NOT_ALLOWED', undefined]);
  assert.deepEqual([kiosk.status, kiosk.body.transactionId, kiosk.body.clientType], [200, transaction.id, 'kiosk']);
});

test('mobile gets a transaction by id, but a closed one only returns TRANSACTION_ALREADY_PROCESSED', async (t) => {
  const open = openTransaction();
  const closed = openTransaction({ status: 'completed', remainingAmount: 0 });
  // รถออกไปแล้วแต่สถานะยังไม่ completed ก็ถือว่าปิดแล้วเหมือนตอนสร้าง charge
  const exited = openTransaction({ status: 'paid_waiting_exit', exitAt: '2026-10-26T10:00:00.000Z' });
  mockChargeFlow(t, [open, closed, exited]);
  const request = await startClientApi(t);

  const found = await request(`/transactions/${open.id}`, { ip: '198.51.100.2' });
  const done = await request(`/transactions/${closed.id}`, { ip: '198.51.100.2' });
  const left = await request(`/transactions/${exited.id}`, { ip: '198.51.100.2' });
  const missing = await request(`/transactions/${createId('t')}`, { ip: '198.51.100.2' });

  assert.deepEqual([found.status, found.body.transactionId, found.body.clientType, found.body.qrData], [200, open.id, 'mobile', open.qrData]);
  assert.deepEqual([done.status, done.body.code, done.body.plateNo, done.body.transactionId], [403, 'TRANSACTION_ALREADY_PROCESSED', undefined, undefined]);
  assert.deepEqual([left.status, left.body.code], [403, 'TRANSACTION_ALREADY_PROCESSED']);
  assert.deepEqual([missing.status, missing.body.code], [404, 'TRANSACTION_NOT_FOUND']);
});

test('mobile charge requires transactionId and plateNo of that transaction', async (t) => {
  const transaction = openTransaction();
  const { created } = mockChargeFlow(t, [transaction]);
  const request = await startClientApi(t);
  const ip = '198.51.100.3';

  const withoutId = await request('/payments/charges', { method: 'POST', ip, body: { plateNo: transaction.plateNo, method: 'promptpay' } });
  const wrongPlate = await request('/payments/charges', { method: 'POST', ip, body: { plateNo: 'ขค9999กรุงเทพมหานคร', method: 'promptpay', transactionId: transaction.id } });

  assert.deepEqual([withoutId.status, withoutId.body.code], [400, 'TRANSACTION_ID_REQUIRED']);
  assert.deepEqual([wrongPlate.status, wrongPlate.body.code], [400, 'TRANSACTION_PLATE_MISMATCH']);
  assert.equal(created.length, 0);
});

test('mobile creates a charge with transactionId and matching plateNo, then loads its QR', async (t) => {
  const transaction = openTransaction();
  const { created } = mockChargeFlow(t, [transaction]);
  const request = await startClientApi(t);
  const ip = '198.51.100.4';

  // ทะเบียนที่ต่างกันแค่ช่องว่าง/ขีดถือว่าตรงกัน
  const res = await request('/payments/charges', { method: 'POST', ip, body: { plateNo: 'กข 1234 กรุงเทพมหานคร', method: 'promptpay', transactionId: transaction.id, amount: 1 } });
  const charge = res.body.charge as { chargeId: string; channel: string; amount: number };
  const qr = await request(`/payments/charges/${charge.chargeId}/qr`, { ip });

  assert.deepEqual([res.status, res.body.clientType, charge.channel], [201, 'mobile', 'mobile']);
  // ยอดมาจากยอดค้างของรายการ ไม่ใช่ amount ที่ client ส่งมา
  assert.equal(charge.amount, 4000);
  assert.deepEqual([created[0]?.amount, created[0]?.metadata?.transactionId, created[0]?.metadata?.channel, created[0]?.metadata?.processedBy], [40, transaction.id, 'mobile', 'mobile_user']);
  assert.equal(created[0]?.description, `Parking payment ${transaction.plateNo}`);
  assert.deepEqual([qr.status, qr.headers.get('content-type')], [200, 'image/png']);
});

test('mobile charge keeps TRANSACTION_NOT_FOUND and TRANSACTION_ALREADY_PROCESSED', async (t) => {
  const transaction = openTransaction();
  const exited = openTransaction({ status: 'paid_waiting_exit', exitAt: '2026-10-26T10:00:00.000Z' });
  const cancelled = openTransaction({ status: 'cancelled' });
  const { created } = mockChargeFlow(t, [transaction, exited, cancelled]);
  const request = await startClientApi(t);
  const charge = (transactionId: string) => request('/payments/charges', { method: 'POST', ip: '198.51.100.5', body: { plateNo: transaction.plateNo, method: 'promptpay', transactionId } });

  const missing = await charge(createId('t'));
  const left = await charge(exited.id);
  const done = await charge(cancelled.id);

  assert.deepEqual([missing.status, missing.body.code], [404, 'TRANSACTION_NOT_FOUND']);
  assert.deepEqual([left.status, left.body.code], [403, 'TRANSACTION_ALREADY_PROCESSED']);
  assert.deepEqual([done.status, done.body.code], [403, 'TRANSACTION_ALREADY_PROCESSED']);
  assert.equal(created.length, 0);
});

test('kiosk still creates a charge with plateNo only', async (t) => {
  const transaction = openTransaction();
  const { created } = mockChargeFlow(t, [transaction]);
  mockKioskAuth(t);
  const request = await startClientApi(t);

  const res = await request('/payments/charges', { method: 'POST', ip: '198.51.100.6', kiosk: true, body: { plateNo: transaction.plateNo, method: 'promptpay' } });

  assert.deepEqual([res.status, res.body.clientType, (res.body.charge as { channel: string }).channel], [201, 'kiosk', 'kiosk']);
  assert.equal(created[0]?.metadata?.transactionId, transaction.id);
});

test('mobile cannot record EDC payments', async (t) => {
  const transaction = openTransaction();
  mockChargeFlow(t, [transaction]);
  const processed: unknown[] = [];
  stub(t, transactionPaymentService, { processPayment: async (...args) => (processed.push(args), transaction) });
  const request = await startClientApi(t);
  const body = { transactionId: transaction.id, plateNo: transaction.plateNo, amount: 40, reference: 'APPR-1', terminalId: 'TID-1' };

  const edc = await request('/payments/edc', { method: 'POST', ip: '198.51.100.7', body });

  assert.deepEqual([edc.status, edc.body.code], [400, 'DEVICE_ID_REQUIRED']);
  assert.equal(processed.length, 0);
});

test('mobile requests over the per-IP rate limit get 429 with Retry-After, kiosk on the same IP is not limited', async (t) => {
  const transaction = openTransaction();
  mockChargeFlow(t, [transaction]);
  mockKioskAuth(t);
  const request = await startClientApi(t);
  const ip = '203.0.113.9';
  const limit = Number(process.env.PUBLIC_CLIENT_RATE_LIMIT);

  for (let i = 0; i < limit; i += 1) assert.equal((await request(`/transactions/${transaction.id}`, { ip })).status, 200);
  const limited = await request(`/transactions/${transaction.id}`, { ip });
  const limitedCharge = await request('/payments/charges', { method: 'POST', ip, body: { plateNo: transaction.plateNo, method: 'promptpay', transactionId: transaction.id } });
  const kiosk = await request(`/transactions/${transaction.id}`, { ip, kiosk: true });
  const otherIp = await request(`/transactions/${transaction.id}`, { ip: '203.0.113.10' });

  assert.deepEqual([limited.status, limited.body.code], [429, 'TOO_MANY_REQUESTS']);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(limitedCharge.status, 429);
  assert.equal(kiosk.status, 200);
  assert.equal(otherIp.status, 200);
});

test('transaction ids are random UUID v4 and qrData carries only tx', () => {
  const ids = [createId('t'), createId('t')];
  assert.ok(ids.every((id) => UUID_V4_ID.test(id)));
  assert.notEqual(ids[0], ids[1]);

  const row = fixture<Transaction>({ id: ids[0], billNo: 'PK202610260001', plateNo: 'ABC1234', vehicleType: 'car', serviceType: 'parking', entryAt: new Date('2026-10-26T08:00:00.000Z'), exitAt: null, amount: 0, totalPaid: 0, payments: [], status: 'pending' });
  const transaction = transactionLookupService.toTransactionApi(row, { pricingConfig: { pricingRules: [] }, systemSettings: { general: { frontendUrl: 'https://pay.example.com' } } });
  const qr = new URL(transaction.qrData);

  assert.equal(`${qr.origin}${qr.pathname}`, 'https://pay.example.com/payment');
  assert.deepEqual([...qr.searchParams.keys()], ['tx']);
  assert.equal(qr.searchParams.get('tx'), ids[0]);
});
