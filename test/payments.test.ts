// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
// Import Test Helpers
import { fixture, stub } from './support/mock';
import { mockSse } from './support/sse';
// Import Middlewares
import { socketTicketRateLimit } from '../src/middlewares/rate-limit.middleware';
// Import Repositories
import * as chargesRepository from '../src/repositories/charges.repository';
// Import Services
import * as paymentsService from '../src/services/payments.service';
import * as deviceRegistryService from '../src/services/shared/device-registry.service';
import * as paymentSelectionService from '../src/services/shared/payment-selection.service';
import * as socketTicketService from '../src/services/shared/socket-ticket.service';
import * as transactionLookupService from '../src/services/shared/transaction-lookup.service';
// Import Realtime
import * as sse from '../src/realtime/sse';
// Import Types
import type { GatewayChargeApi } from '../src/types/shared/payment.type';
import type { UserApi } from '../src/types/shared/user.type';
// Import Utils
import { appEvents } from '../src/utils/events';

/* -------------------------------------- Tests -------------------------------------- */

test('EDC reconciliation groups card payments of the Bangkok day by terminal', async (t) => {
  stub(t, deviceRegistryService, { listEdcDevices: async () => [{ deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', terminalId: 'TID-1', location: 'Lobby', provider: 'KBank', usage: 'device' }] });
  stub(t, transactionLookupService, { listPaymentRowsSince: async () => [
    { id: 't_1', plateNo: 'กข1234', billNo: 'B1', payments: [
      { id: 'p1', method: 'card', channel: 'kiosk', paidAmount: 40, paidAt: '2026-10-01T03:00:00.000Z', reference: 'APPR-1', terminalId: 'TID-1', deviceId: 'K-1' },
      { id: 'p2', method: 'promptpay', channel: 'kiosk', paidAmount: 20, paidAt: '2026-10-01T04:00:00.000Z' },
    ] },
    { id: 't_2', plateNo: 'กข5678', billNo: 'B2', payments: [
      { id: 'p3', method: 'card', channel: 'cashier', paidAmount: 30.5, paidAt: '2026-10-01T05:00:00.000Z', reference: 'APPR-2', terminalId: 'TID-ADMIN' },
      // วันถัดไปตามเวลาไทย (01:00 ของ 2 ต.ค.) ต้องไม่ถูกนับ
      { id: 'p4', method: 'card', channel: 'cashier', paidAmount: 10, paidAt: '2026-10-01T18:00:00.000Z', reference: 'APPR-3', terminalId: 'TID-ADMIN' },
    ] },
  ] });

  const report = await paymentsService.getEdcReconciliation({ date: '2026-10-01' });

  assert.deepEqual(report.range, { startDate: '2026-09-30T17:00:00.000Z', endDate: '2026-10-01T16:59:59.999Z' });
  assert.deepEqual(report.total, { count: 2, amount: 70.5 });
  assert.deepEqual(report.terminals.map((terminal) => [terminal.terminalId, terminal.count, terminal.amount]), [['TID-1', 1, 40], ['TID-ADMIN', 1, 30.5]]);
  assert.equal(report.terminals[0].payments[0].reference, 'APPR-1');
  assert.deepEqual(report.terminals[0].edcDevice, { deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', location: 'Lobby', provider: 'KBank', usage: 'device' });
  assert.equal(report.terminals[1].edcDevice, null);
});

test('EDC reconciliation rejects invalid or too long date ranges', async () => {
  await assert.rejects(paymentsService.getEdcReconciliation({ date: '2026-02-31' }), { code: 'INVALID_DATE_RANGE' });
  await assert.rejects(paymentsService.getEdcReconciliation({ start_date: '2026-01-01', end_date: '2026-03-01' }), { code: 'INVALID_DATE_RANGE' });
});

test('Admin payment methods show card only when an active cashier EDC exists', async (t) => {
  stub(t, paymentSelectionService, { listAvailableMethods: async () => [{ id: 'cash' }, { id: 'card' }] });
  const edcLists = [[{ deviceId: 'EDC-C1', deviceName: 'Counter 1', terminalId: 'TID-C1' }], []];
  stub(t, deviceRegistryService, { listCashierEdcDevices: async () => edcLists.shift() });

  assert.deepEqual((await paymentsService.listPaymentMethods()).methods.map((method) => method.id), ['cash', 'card']);
  assert.deepEqual((await paymentsService.listPaymentMethods()).methods.map((method) => method.id), ['cash']);
});

test('refund SSE sends the pending snapshot first and then refund and payment settings events', async (t) => {
  process.env.REALTIME_PING_INTERVAL_MS = '1000';
  t.mock.timers.enable({ apis: ['setInterval'] });
  const snapshot = { pendingCount: 1, pendingAmount: 4000, data: [{ chargeId: 'chrg_1', refundAmount: 4000 }] };
  stub(t, paymentsService, { getPendingRefundsSnapshot: async () => snapshot });

  const { req, res, events } = mockSse({ id: 'u_1' });
  t.after(() => req.emit('close'));
  await sse.openRefundEventStream(req, res);

  appEvents.emit('refund_event', { type: 'refund_required', chargeId: 'chrg_2', pendingCount: 2, pendingAmount: 6000 });
  appEvents.emit('refund_event', { type: 'refund_resolved', chargeId: 'chrg_1', pendingCount: 1, pendingAmount: 2000 });
  appEvents.emit('payment_settings_updated', { type: 'payment_settings_updated' });

  assert.deepEqual(events.map((event) => event.type), ['connected', 'refunds_snapshot', 'refund_required', 'refund_resolved', 'payment_settings_updated']);
  assert.deepEqual(events[1]?.data, snapshot.data);
  assert.equal(events[1]?.pendingAmount, 4000);
});

test('ws-ticket issues a single-use ticket bound to the charge, user and session', async (t) => {
  stub(t, chargesRepository, { getGatewayChargeByChargeId: async (chargeId) => (chargeId === 'chrg_1' ? fixture<GatewayChargeApi>({ chargeId }) : null) });
  const user = fixture<UserApi>({ id: 'u_1' });

  const { ticket, expiresIn } = await paymentsService.createSocketTicket({ chargeId: 'chrg_1' }, user, 'sess_1');

  assert.equal(expiresIn, 30);
  // ใช้กับ charge อื่นไม่ได้ และใช้ได้ครั้งเดียว
  assert.equal(socketTicketService.consumeSocketTicket(ticket, 'chrg_2'), null);
  const { ticket: second } = await paymentsService.createSocketTicket({ chargeId: 'chrg_1' }, user, 'sess_1');
  assert.deepEqual({ ...socketTicketService.consumeSocketTicket(second, 'chrg_1'), expiresAt: 0 }, { userId: 'u_1', sessionId: 'sess_1', chargeId: 'chrg_1', expiresAt: 0 });
  assert.equal(socketTicketService.consumeSocketTicket(second, 'chrg_1'), null);
  await assert.rejects(paymentsService.createSocketTicket({ chargeId: 'chrg_404' }, user, 'sess_1'), { statusCode: 404, code: 'GATEWAY_CHARGE_NOT_FOUND' });
  await assert.rejects(paymentsService.createSocketTicket({}, user, 'sess_1'), { statusCode: 400, code: 'VALIDATION_ERROR' });
});

test('ws-ticket allows 30 requests per user per minute and answers 429 with Retry-After', async (t) => {
  const app = express();
  app.post('/ws-ticket', (req, _res, next) => {
    req.user = fixture<UserApi>({ id: String(req.query.user) });
    next();
  }, socketTicketRateLimit, (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const url = (user: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}/ws-ticket?user=${user}`;

  for (let i = 0; i < 30; i += 1) assert.equal((await fetch(url('u_limit'), { method: 'POST' })).status, 200);
  const limited = await fetch(url('u_limit'), { method: 'POST' });
  const otherUser = await fetch(url('u_other'), { method: 'POST' });

  assert.equal(limited.status, 429);
  assert.equal(((await limited.json()) as { code: string }).code, 'TOO_MANY_REQUESTS');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(otherUser.status, 200);
});
