// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
// Import Test Helpers
import { fixture as asFixture, stub } from '../support/mock';
// Import Config
import { prisma } from '../../src/db/prisma';
// Import Repositories
import * as chargesRepository from '../../src/repositories/charges.repository';
import * as transactionsRepository from '../../src/repositories/transactions.repository';
// Import Services
import * as omisePaymentService from '../../src/services/shared/omise-payment.service';
import * as omiseService from '../../src/services/shared/omise.service';
import * as paymentSelectionService from '../../src/services/shared/payment-selection.service';
import * as transactionLookupService from '../../src/services/shared/transaction-lookup.service';
import * as transactionPaymentService from '../../src/services/shared/transaction-payment.service';
// Import Types
import type { CreateChargeInput, GatewayChargeApi, GatewayChargeInput, GatewayChargeUpdate, OmiseChargeData } from '../../src/types/shared/payment.type';
// Import Utils
import { ApiError } from '../../src/utils/api-error';
import { appEvents } from '../../src/utils/events';

/* -------------------------------------- Types -------------------------------------- */

// Type refund_event ที่ test ตรวจ
interface RefundEvent {
  type: string;
  chargeId?: string;
  resolvedBy?: string | null;
  refundNote?: string | null;
  refundMethod?: string | null;
  refundId?: string | null;
  pendingCount?: number;
  pendingAmount?: number;
  at?: string;
  [key: string]: unknown;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function สร้าง Omise charge ปลอมจาก payload ที่ส่งเข้า createCharge
function fakeCharge(payload: CreateChargeInput): OmiseChargeData {
  return { id: 'chrg_test', status: 'pending', amount: omiseService.toMinorAmount(payload.amount), currency: 'thb', metadata: payload.metadata };
}

// Function สร้าง gateway charge ที่บันทึกไว้แล้ว (ยอด 40 บาท = 4000 สตางค์)
function savedCharge(overrides: Partial<GatewayChargeApi> = {}): GatewayChargeApi {
  return asFixture<GatewayChargeApi>({ id: 'pgc_1', provider: 'omise', chargeId: 'chrg_1', transactionId: 't_123', plateNo: '3ABC1234', amount: 4000, method: 'promptpay', channel: 'mobile', status: 'pending', processedAt: null, raw: {}, ...overrides });
}

// Function mock การบันทึก gateway charge และเก็บ update ที่เกิดขึ้น (claim และ resolve สำเร็จได้ครั้งเดียวเหมือนใน database)
function mockChargeUpdates(t: TestContext, existing: GatewayChargeApi | null): GatewayChargeUpdate[] {
  const updates: GatewayChargeUpdate[] = [];
  let claimed = Boolean(existing?.processedAt);
  let current: GatewayChargeApi | null = existing ? { ...existing } : existing;
  stub(t, prisma, { $transaction: async (callback) => callback(prisma) });
  stub(t, transactionsRepository, { lockTransactionById: async () => null });
  stub(t, chargesRepository, {
    claimGatewayCharge: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    getGatewayChargeByChargeId: async () => current,
    summarizePendingRefunds: async () => {
      const pending = Boolean(current && (current.refundAmount ?? 0) > 0 && !current.refundResolvedAt);
      return { count: pending ? 1 : 0, amount: pending ? current?.refundAmount ?? 0 : 0 };
    },
    resolveGatewayChargeRefund: async (_chargeId, { refundNote = null, refundResolvedBy = null } = {}) => {
      if (!current || !((current.refundAmount ?? 0) > 0) || current.refundResolvedAt) return false;
      current = { ...current, refundResolvedAt: new Date().toISOString(), refundNote, refundResolvedBy };
      return true;
    },
    updateGatewayCharge: async (_chargeId, data) => {
      updates.push(data);
      current = asFixture<GatewayChargeApi>({ ...current, ...data });
      return current;
    },
  });
  return updates;
}

// Function เก็บ refund_event ที่ถูกส่งระหว่าง test
function captureRefundEvents(t: TestContext): RefundEvent[] {
  const events: RefundEvent[] = [];
  const listener = (event: RefundEvent) => events.push(event);
  appEvents.on('refund_event', listener);
  t.after(() => appEvents.off('refund_event', listener));
  return events;
}

/* -------------------------------------- Tests -------------------------------------- */

test('creates Admin Omise charges as cashier channel with admin source context', async (t) => {
  const created: GatewayChargeInput[] = [];
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  stub(t, omiseService, { createCharge: async (payload) => fakeCharge(payload) });
  stub(t, paymentSelectionService, { assertPaymentSelection: async () => ({ ok: true }) });
  stub(t, chargesRepository, {
    listPendingGatewayChargesByTransactionId: async () => [],
    createGatewayCharge: async (data) => {
      created.push(data);
      return { id: 'pgc_123', provider: 'omise', ...data };
    },
  });

  const result = await omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', source: 'src_1', sourceType: 'promptpay', amount: 4000, processedBy: 'u_admin' });

  assert.equal(result.channel, 'cashier');
  assert.equal(created[0]?.method, 'promptpay');
  assert.equal(created[0]?.raw?.metadata?.sourceContext, 'admin');
  assert.equal(created[0]?.raw.metadata.processedBy, 'u_admin');
});

test('rejects Admin Omise charges outside cashier channel and amount mismatch', async (t) => {
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });

  // Admin รับบัตรด้วยเครื่อง EDC เท่านั้น
  await assert.rejects(omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', token: 'tokn_1' }), { statusCode: 400, code: 'ADMIN_CARD_NOT_SUPPORTED' });
  await assert.rejects(omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', source: 'src_1', channel: 'mobile' }), { code: 'ADMIN_CHANNEL_MUST_BE_CASHIER' });
  await assert.rejects(omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', source: 'src_1', amount: 100 }), { code: 'AMOUNT_MISMATCH' });
  // ไม่มี method/sourceType และไม่ใช่ card token ต้องบอกให้ส่ง method มา
  await assert.rejects(omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', source: 'src_1' }), /method or sourceType is required/);
});

test('does not create an Omise charge when the method is disabled in payment settings', async (t) => {
  const charges = [];
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  stub(t, omiseService, { createCharge: async (payload) => charges.push(payload) });
  stub(t, paymentSelectionService, {
    assertPaymentSelection: async () => {
      throw new ApiError(400, 'PAYMENT_SELECTION_INVALID', 'Payment method is inactive');
    },
  });

  await assert.rejects(
    omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', source: 'src_1', method: 'promptpay' }),
    { statusCode: 400, code: 'PAYMENT_SELECTION_INVALID', message: 'Payment method is inactive' },
  );
  assert.equal(charges.length, 0);
});

test('downloads the PromptPay QR from download_uri before the document location', async (t) => {
  const downloaded: unknown[] = [];
  stub(t, chargesRepository, {
    getGatewayChargeByChargeId: async () => ({
      provider: 'omise',
      method: 'promptpay',
      raw: { source: { scannable_code: { image: { location: '/charges/chrg_1/documents/docu_1', download_uri: '/charges/chrg_1/documents/docu_1/downloads/A1' } } } },
    }),
  });
  stub(t, omiseService, {
    downloadDocument: async (path) => {
      downloaded.push(path);
      return { contentType: 'image/png', body: Buffer.from('qr') };
    },
  });

  await omisePaymentService.getOmiseQrImage({ chargeId: 'chrg_1' });

  assert.deepEqual(downloaded, ['/charges/chrg_1/documents/docu_1/downloads/A1']);
});

test('returns the pending QR instead of creating a second charge for the same amount', async (t) => {
  const charges = [];
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  stub(t, paymentSelectionService, { assertPaymentSelection: async () => ({ ok: true }) });
  stub(t, omiseService, {
    createCharge: async (payload) => charges.push(payload),
    retrieveCharge: async () => ({ id: 'chrg_old', status: 'pending', amount: 4000, currency: 'thb', source: { scannable_code: { type: 'qr' } } }),
  });
  stub(t, chargesRepository, {
    listPendingGatewayChargesByTransactionId: async () => [savedCharge({ chargeId: 'chrg_old', channel: 'cashier' })],
    updateGatewayCharge: async (chargeId, data) => savedCharge({ chargeId, channel: 'cashier', ...data }),
  });

  const result = await omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', source: 'src_new', method: 'promptpay' });

  assert.equal(result.reused, true);
  assert.equal(result.chargeId, 'chrg_old');
  assert.equal(charges.length, 0);
});

test('webhook records money for a closed transaction as a full refund instead of failing', async (t) => {
  const updates = mockChargeUpdates(t, savedCharge());
  stub(t, omiseService, { retrieveCharge: async () => ({ id: 'chrg_1', status: 'successful', paid: true }) });
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'paid_waiting_exit', remainingAmount: 0, exitAt: null }),
  });
  stub(t, transactionPaymentService, { processPayment: async () => assert.fail('must not record a second payment') });

  const result = await omisePaymentService.processOmiseWebhookEvent({ data: { id: 'chrg_1' } });

  assert.equal(result.action, 'refund_required');
  assert.deepEqual([updates[0]?.refundAmount, updates[0]?.refundReason], [4000, 'already_paid']);
  assert.ok(updates[0]?.processedAt);
});

test('webhook records the payment and flags only the overpaid part for refund', async (t) => {
  const updates = mockChargeUpdates(t, savedCharge());
  stub(t, omiseService, { retrieveCharge: async () => ({ id: 'chrg_1', status: 'successful', paid: true }) });
  // ระหว่างรอสแกน Admin รับเงินสดไปแล้ว 30 บาท เหลือค้าง 10 บาท แต่ QR เก็บ 40 บาท
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'partially_paid', remainingAmount: 10, exitAt: null }),
  });
  stub(t, transactionPaymentService, { processPayment: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'paid_waiting_exit', netAmount: 40, totalPaid: 70, remainingAmount: 0 }) });

  const result = await omisePaymentService.processOmiseWebhookEvent({ data: { id: 'chrg_1' } });

  assert.equal(result.action, 'processed');
  assert.deepEqual([updates[0]?.refundAmount, updates[0]?.refundReason], [3000, 'overpaid']);
});

test('resolves a pending refund once and emits refund_resolved once', async (t) => {
  mockChargeUpdates(t, savedCharge({ status: 'successful', refundAmount: 4000, refundReason: 'already_paid', refundResolvedAt: null }));
  const events = captureRefundEvents(t);

  // กด resolve พร้อมกันสองที่ สำเร็จได้ครั้งเดียว
  const results = await Promise.allSettled([
    omisePaymentService.resolveGatewayRefund('chrg_1', { note: 'cash refund', resolvedBy: 'u_admin' }),
    omisePaymentService.resolveGatewayRefund('chrg_1', { note: 'cash refund', resolvedBy: 'u_admin' }),
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal((results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined)?.reason.code, 'REFUND_ALREADY_RESOLVED');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'refund_resolved');
  assert.deepEqual([events[0]?.chargeId, events[0]?.resolvedBy, events[0]?.refundNote], ['chrg_1', 'u_admin', 'cash refund']);
  assert.deepEqual([events[0]?.pendingCount, events[0]?.pendingAmount], [0, 0]);
});

test('emits refund_required with the refund amount and pending totals when money cannot be applied', async (t) => {
  mockChargeUpdates(t, savedCharge());
  const events = captureRefundEvents(t);
  stub(t, omiseService, { retrieveCharge: async () => ({ id: 'chrg_1', status: 'successful', paid: true, paid_at: '2026-10-01T03:05:00.000Z' }) });
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'paid_waiting_exit', remainingAmount: 0, exitAt: null }),
  });

  await omisePaymentService.processOmiseWebhookEvent({ data: { id: 'chrg_1' } });

  assert.equal(events.length, 1);
  assert.ok(events[0]);
  const { at, ...event } = events[0];
  assert.ok(at);
  assert.deepEqual(event, {
    type: 'refund_required',
    chargeId: 'chrg_1',
    transactionId: 't_123',
    plateNo: '3ABC1234',
    method: 'promptpay',
    channel: 'mobile',
    amount: 4000,
    refundAmount: 4000,
    refundReason: 'already_paid',
    paidAt: '2026-10-01T03:05:00.000Z',
    refundMethod: null,
    applied: false,
    pendingCount: 1,
    pendingAmount: 4000,
  });
});

test('rejects resolving a charge without a pending refund', async (t) => {
  mockChargeUpdates(t, savedCharge({ status: 'successful', refundAmount: null }));
  await assert.rejects(omisePaymentService.resolveGatewayRefund('chrg_1'), { statusCode: 400, code: 'REFUND_NOT_REQUIRED' });
});

test('creates PromptPay charges with a QR expiry', async (t) => {
  const payloads: CreateChargeInput[] = [];
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  stub(t, paymentSelectionService, { assertPaymentSelection: async () => ({ ok: true }) });
  stub(t, omiseService, {
    createCharge: async (payload) => {
      payloads.push(payload);
      return fakeCharge(payload);
    },
  });
  stub(t, chargesRepository, {
    listPendingGatewayChargesByTransactionId: async () => [],
    createGatewayCharge: async (data) => ({ id: 'pgc_1', provider: 'omise', ...data }),
  });

  await omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', source: 'src_1', method: 'promptpay' });

  // ค่า default 10 นาที
  const minutes = (new Date(payloads[0]?.expiresAt ?? 0).getTime() - Date.now()) / 60000;
  assert.ok(minutes > 9 && minutes <= 10);
});

test('a successful charge is applied once even when the webhook is delivered twice', async (t) => {
  mockChargeUpdates(t, savedCharge());
  stub(t, omiseService, { retrieveCharge: async () => ({ id: 'chrg_1', status: 'successful', paid: true }) });
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  const payments = [];
  stub(t, transactionPaymentService, { processPayment: async (id, options) => {
    payments.push(options);
    return { id: 't_123', plateNo: '3ABC1234', status: 'paid_waiting_exit', netAmount: 40, totalPaid: 40, remainingAmount: 0 };
  } });

  // webhook ทั้งสองอ่าน processedAt = null ก่อน แต่ claim สำเร็จได้แค่ครั้งเดียว
  const results = await Promise.all([
    omisePaymentService.processOmiseWebhookEvent({ data: { id: 'chrg_1' } }),
    omisePaymentService.processOmiseWebhookEvent({ data: { id: 'chrg_1' } }),
  ]);

  assert.equal(payments.length, 1);
  assert.deepEqual(results.map((result) => result.action).sort(), ['already_processed', 'processed']);
});

test('ignores webhook events of other Omise objects without calling Omise', async (t) => {
  stub(t, omiseService, { retrieveCharge: async () => assert.fail('must not retrieve a transfer as a charge') });

  const result = await omisePaymentService.processOmiseWebhookEvent({ key: 'transfer.create', data: { object: 'transfer', id: 'trsf_1' } });

  assert.equal(result.action, 'ignored');
});

test('recreates a missing gateway charge from Omise metadata before applying the payment', async (t) => {
  const created: GatewayChargeInput[] = [];
  mockChargeUpdates(t, null);
  stub(t, chargesRepository, {
    createGatewayChargeIfMissing: async (data) => {
      created.push(data);
      return savedCharge({ chargeId: data.chargeId });
    },
  });
  stub(t, omiseService, {
    retrieveCharge: async () => ({ id: 'chrg_1', status: 'successful', paid: true, amount: 4000, currency: 'thb', metadata: { transactionId: 't_123', plateNo: '3ABC1234', channel: 'mobile', method: 'promptpay' } }),
  });
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  stub(t, transactionPaymentService, { processPayment: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'paid_waiting_exit', netAmount: 40, totalPaid: 40, remainingAmount: 0 }) });

  const result = await omisePaymentService.processOmiseWebhookEvent({ data: { object: 'charge', id: 'chrg_1' } });

  assert.equal(created[0]?.transactionId, 't_123');
  assert.equal(result.action, 'processed');
});

test('rejects a returnUri that is not an http or https URL', async (t) => {
  await assert.rejects(
    omisePaymentService.createOmiseChargeForClient({ plateNo: '3ABC1234', source: 'src_1', channel: 'mobile', returnUri: 'javascript:alert(1)' }),
    { statusCode: 400, code: 'INVALID_RETURN_URI' },
  );
});

test('client charges do not accept card tokens because cards are taken on the EDC terminal', async () => {
  await assert.rejects(
    omisePaymentService.createOmiseChargeForClient({ plateNo: '3ABC1234', token: 'tokn_1', channel: 'kiosk' }),
    { statusCode: 400, code: 'CARD_TOKEN_NOT_SUPPORTED' },
  );
});

test('backend creates the PromptPay source itself when the frontend sends only method promptpay', async (t) => {
  const payloads: CreateChargeInput[] = [];
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  stub(t, paymentSelectionService, { assertPaymentSelection: async () => ({ ok: true }) });
  stub(t, omiseService, {
    createCharge: async (payload) => {
      payloads.push(payload);
      return fakeCharge(payload);
    },
  });
  stub(t, chargesRepository, {
    listPendingGatewayChargesByTransactionId: async () => [],
    createGatewayCharge: async (data) => ({ id: 'pgc_1', provider: 'omise', ...data }),
  });

  await omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', method: 'promptpay' });

  assert.deepEqual(payloads[0]?.source, { type: 'promptpay' });
  assert.ok(payloads[0]?.expiresAt);
  // วิธีอื่นที่ไม่ใช่ PromptPay ยังต้องมี source จาก frontend
  await assert.rejects(omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', method: 'mobile_banking' }), { code: 'SOURCE_REQUIRED' });
});

test('verify records a charge that Omise reports paid once and emits payment_updated', async (t) => {
  mockChargeUpdates(t, savedCharge({ channel: 'cashier' }));
  stub(t, omiseService, { retrieveCharge: async () => ({ id: 'chrg_1', status: 'successful', paid: true }) });
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 40, exitAt: null }),
  });
  stub(t, transactionPaymentService, { processPayment: async () => ({ id: 't_123', plateNo: '3ABC1234', status: 'paid_waiting_exit', netAmount: 40, totalPaid: 40, remainingAmount: 0 }) });
  const events: { paymentStatus?: string; applied?: boolean }[] = [];
  const listener = (event: { paymentStatus?: string; applied?: boolean }) => events.push(event);
  appEvents.on('payment_updated', listener);
  t.after(() => appEvents.off('payment_updated', listener));

  const first = await omisePaymentService.verifyOmiseCharge('chrg_1');
  // กดซ้ำหลังบันทึกแล้วไม่บันทึกซ้ำและไม่เรียก Omise อีก
  const second = await omisePaymentService.verifyOmiseCharge('chrg_1');

  assert.deepEqual([first.action, second.action], ['processed', 'already_processed']);
  assert.deepEqual(events.map((event) => [event.paymentStatus, event.applied]), [['successful', true]]);
});

test('verify leaves a pending charge untouched and does not emit an event', async (t) => {
  const updates = mockChargeUpdates(t, savedCharge());
  stub(t, omiseService, { retrieveCharge: async () => ({ id: 'chrg_1', status: 'pending' }) });
  const events: unknown[] = [];
  const listener = (event: unknown) => events.push(event);
  appEvents.on('payment_updated', listener);
  t.after(() => appEvents.off('payment_updated', listener));

  const result = await omisePaymentService.verifyOmiseCharge('chrg_1');

  assert.deepEqual([result.action, result.status, updates.length, events.length], ['pending', 'pending', 0, 0]);
});

test('verify saves an expired charge and rejects unknown charges', async (t) => {
  const updates = mockChargeUpdates(t, savedCharge());
  stub(t, omiseService, { retrieveCharge: async () => ({ id: 'chrg_1', status: 'expired' }) });

  const result = await omisePaymentService.verifyOmiseCharge('chrg_1');

  assert.deepEqual([result.action, result.status, updates[0]?.status], ['updated', 'expired', 'expired']);
  stub(t, chargesRepository, { getGatewayChargeByChargeId: async () => null });
  await assert.rejects(omisePaymentService.verifyOmiseCharge('chrg_missing'), { statusCode: 404, code: 'GATEWAY_CHARGE_NOT_FOUND' });
});

test('rejects PromptPay below the Omise minimum for Admin and client charges before calling Omise', async (t) => {
  const transaction = { id: 't_123', plateNo: '3ABC1234', status: 'pending', remainingAmount: 15, exitAt: null };
  const created: CreateChargeInput[] = [];
  stub(t, transactionLookupService, {
    getTransactionApiById: async () => transaction,
    lookupTransactionApiByPlateNo: async () => ({ matchType: 'single', transaction }),
  });
  stub(t, omiseService, { createCharge: async (payload) => (created.push(payload), fakeCharge(payload)) });
  const isBelowMinimum = (error: ApiError): boolean => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'AMOUNT_BELOW_GATEWAY_MINIMUM');
    assert.deepEqual(error.details, { minimumAmount: 20, remainingAmount: 15 });
    return true;
  };

  await assert.rejects(omisePaymentService.createOmiseChargeForAdmin({ transactionId: 't_123', method: 'promptpay' }), isBelowMinimum);
  await assert.rejects(omisePaymentService.createOmiseChargeForClient({ plateNo: '3ABC1234', method: 'promptpay', channel: 'mobile' }), isBelowMinimum);
  assert.equal(created.length, 0);
});
