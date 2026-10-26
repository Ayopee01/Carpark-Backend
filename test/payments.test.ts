// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
// Import Test Helpers
import { fixture, stub } from './support/mock';
// Import Middlewares
import { socketTicketRateLimit } from '../src/middlewares/rate-limit.middleware';
// Import Repositories
import * as chargesRepository from '../src/repositories/charges.repository';
// Import Services
import * as paymentsService from '../src/services/payments.service';
import * as deviceRegistryService from '../src/services/shared/device-registry.service';
import * as paymentSelectionService from '../src/services/shared/payment-selection.service';
import * as socketTicketService from '../src/services/shared/socket-ticket.service';
// Import Types
import type { GatewayChargeApi } from '../src/types/shared/payment.type';
import type { UserApi } from '../src/types/shared/user.type';

/* -------------------------------------- Tests -------------------------------------- */

test('Admin payment methods show card only when an active cashier EDC exists', async (t) => {
  stub(t, paymentSelectionService, { listAvailableMethods: async () => [{ id: 'cash' }, { id: 'card' }] });
  const edcLists = [[{ deviceId: 'EDC-C1', deviceName: 'Counter 1', terminalId: 'TID-C1' }], []];
  stub(t, deviceRegistryService, { listCashierEdcDevices: async () => edcLists.shift() });

  assert.deepEqual((await paymentsService.listPaymentMethods()).methods.map((method) => method.id), ['cash', 'card']);
  assert.deepEqual((await paymentsService.listPaymentMethods()).methods.map((method) => method.id), ['cash']);
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
