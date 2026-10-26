// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture, stub } from './support/mock';
import { getBangkokTodayRange, mockTransactions, payment, transaction } from './support/report';
import { mockSse } from './support/sse';
// Import Services
import * as authService from '../src/services/auth.service';
import * as dashboardService from '../src/services/dashboard.service';
import * as overviewService from '../src/services/overview.service';
// Import Realtime
import * as sse from '../src/realtime/sse';
// Import Types
import type { GatewayChargeApi } from '../src/types/shared/payment.type';
// Import Utils
import { appEvents, emitDashboardUpdated, emitSessionRevoked } from '../src/utils/events';

/* -------------------------------------- Tests -------------------------------------- */

test('dashboard counts tickets by entry date and revenue by paidAt including overstay', async (t) => {
  const today = getBangkokTodayRange();
  const transactions = [
    transaction('pending_today', { entryAt: today.midday, status: 'pending' }),
    transaction('partial_today', {
      entryAt: today.midday,
      status: 'partially_paid',
      payments: [payment('old_partial', { method: 'cash', channel: 'cashier', amount: 10, paidAt: today.yesterday, processedBy: 'u1' })],
    }),
    transaction('cashier_cash_today', {
      entryAt: today.midday,
      payments: [payment('cash_today', { method: 'cash', channel: 'cashier', amount: 50, paidAt: today.midday, processedBy: 'u1' })],
    }),
    transaction('cashier_promptpay_today', {
      entryAt: today.midday,
      payments: [payment('admin_qr_today', { method: 'promptpay', channel: 'cashier', amount: 25, paidAt: today.midday, processedBy: 'u2' })],
    }),
    transaction('kiosk_promptpay_today', {
      entryAt: today.midday,
      payments: [payment('kiosk_qr_today', { method: 'promptpay', channel: 'kiosk', amount: 40, paidAt: today.midday, deviceType: 'kiosk' })],
    }),
    transaction('gate_card_today', {
      entryAt: today.midday,
      payments: [payment('gate_card_today', { method: 'card', channel: 'gate', amount: 30, paidAt: today.midday, deviceType: 'barrier_gate' })],
    }),
    transaction('mobile_promptpay_yesterday_entry', {
      entryAt: today.yesterday,
      payments: [payment('mobile_qr_today', { method: 'promptpay', channel: 'mobile', amount: 100, paidAt: today.midday })],
    }),
    transaction('mobile_promptpay_old_payment', {
      entryAt: today.midday,
      payments: [payment('old_qr', { method: 'promptpay', channel: 'mobile', amount: 999, paidAt: today.yesterday })],
    }),
    transaction('overstay_paid_today', {
      entryAt: today.midday,
      isOverstay: true,
      payments: [payment('overstay_cash', { method: 'cash', channel: 'cashier', amount: 999, paidAt: today.midday })],
    }),
  ];

  mockTransactions(t, transactions);
  const summary = await dashboardService.getDashboardSummary({ includeRefunds: false });

  // overstay ยังนับเป็นบัตรของวันนี้ และเงินที่จ่ายวันนี้นับเป็นรายได้ (payment ของเมื่อวานไม่นับ)
  assert.equal(summary.summaryCards.totalTickets, 8);
  assert.equal(summary.summaryCards.pendingCount, 2);
  assert.equal(summary.summaryCards.paidCount, 6);
  assert.equal(summary.summaryCards.paidRevenue, 1244);

  assert.equal(summary.revenueGroups.find((group) => group.id === 'staff')?.amount, 1049);
  assert.equal(summary.revenueGroups.find((group) => group.id === 'scan')?.amount, 165);

  const breakdown = Object.fromEntries(summary.channelBreakdown.map((item) => [item.code, item]));
  assert.equal(breakdown.cashier.amount, 1074);
  assert.equal(breakdown.cashier.count, 3);
  assert.equal(breakdown.kiosk.amount, 40);
  assert.equal(breakdown.gate.amount, 30);
  assert.equal(breakdown.mobile.amount, 100);
  assert.deepEqual(breakdown.kiosk.allowedMethods, ['qr', 'promptpay']);
});

test('overview and dashboard report the same revenue for the same day', async (t) => {
  const today = getBangkokTodayRange();
  mockTransactions(t, [
    transaction('entered_yesterday_paid_today', {
      entryAt: today.yesterday,
      payments: [payment('pay_today', { method: 'promptpay', channel: 'mobile', amount: 40, paidAt: today.midday })],
    }),
    transaction('partial_today', {
      entryAt: today.midday,
      status: 'partially_paid',
      payments: [payment('partial_cash', { method: 'cash', channel: 'cashier', amount: 10, paidAt: today.midday })],
    }),
  ]);

  const dashboard = await dashboardService.getDashboardSummary({ includeRefunds: false });
  const overview = await overviewService.getOverviewSummary({ start_date: today.startDate, end_date: today.endDate });

  // รายได้นับตามวันที่จ่าย รวมรายการที่เข้าเมื่อวานและรายการที่จ่ายบางส่วน
  assert.equal(dashboard.summaryCards.paidRevenue, 50);
  assert.equal(overview.summaryCards.paidRevenue, 50);
  assert.equal(overview.summaryCards.totalTickets, dashboard.summaryCards.totalTickets);
  assert.deepEqual(overview.serviceSummary.map((item) => item.amount), [10, 40, 0, 0]);
});

test('dashboard SSE sends the new day summary on the first ping after Bangkok midnight', async (t) => {
  process.env.REALTIME_PING_INTERVAL_MS = '1000';
  // เริ่ม 23:59:59 เวลาไทย แล้วเดินเวลาข้ามเที่ยงคืน
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: new Date('2026-09-30T16:59:59.500Z') });
  stub(t, dashboardService, { getDashboardSummary: async () => ({ ok: true }) });
  stub(t, authService, { getSessionEndReasonById: async () => null });

  // Mock req/res ขั้นต่ำของ SSE
  const { req, res, events } = mockSse({ id: 'u_1', permissions: ['dashboard'] });
  t.after(() => req.emit('close'));

  await sse.openDashboardEventStream(req, res);
  t.mock.timers.tick(1000);
  await new Promise(setImmediate);

  const updates = events.filter((event) => event.type === 'dashboard_updated');
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.trigger?.reason, 'day_changed');

  // ping ถัดไปในวันเดียวกันไม่ส่งซ้ำ
  t.mock.timers.tick(1000);
  await new Promise(setImmediate);
  assert.equal(events.filter((event) => event.type === 'dashboard_updated').length, 1);
});

test('admin SSE sends session_revoked and closes only for the matching session or user', async (t) => {
  process.env.REALTIME_PING_INTERVAL_MS = '1000';
  t.mock.timers.enable({ apis: ['setInterval'] });
  stub(t, dashboardService, { getDashboardSummary: async () => ({ ok: true }) });

  // Mock req/res ของ Admin ที่ login แล้ว
  const { req, res, events, isEnded } = mockSse({ id: 'u_1', permissions: ['dashboard'] });
  t.after(() => req.emit('close'));
  await sse.openDashboardEventStream(req, res);

  // session อื่นต้องไม่กระทบ
  emitSessionRevoked({ sessionId: 'sess_other', reason: 'logout' });
  assert.equal(isEnded(), false);

  // ระงับ user (ไม่ระบุ sessionId) ปิดทุก session ของ user
  emitSessionRevoked({ userId: 'u_1', reason: 'user_disabled' });
  assert.equal(isEnded(), true);
  assert.deepEqual(events.filter((event) => event.type === 'session_revoked').map((event) => event.reason), ['user_disabled']);
});

test('dashboard refunds list pending Omise refunds in satang without raw, and are null without transactions permission', async (t) => {
  const pending = [
    fixture<GatewayChargeApi>({ chargeId: 'chrg_1', plateNo: 'กข1234', amount: 4000, refundAmount: 4000, refundReason: 'already_paid', refundResolvedAt: null, raw: { id: 'chrg_1' } }),
    fixture<GatewayChargeApi>({ chargeId: 'chrg_2', plateNo: 'กข5678', amount: 6000, refundAmount: 1050, refundReason: 'overpaid', refundResolvedAt: null, raw: { id: 'chrg_2' } }),
  ];
  mockTransactions(t, [], { pendingRefunds: pending });

  const withRefunds = await dashboardService.getDashboardSummary({ includeRefunds: true });
  const withoutRefunds = await dashboardService.getDashboardSummary({ includeRefunds: false });

  assert.equal(withRefunds.refunds?.pendingCount, 2);
  assert.equal(withRefunds.refunds?.pendingAmount, 5050);
  assert.deepEqual(withRefunds.refunds?.pending.map((item) => [item.chargeId, item.refundAmount]), [['chrg_1', 4000], ['chrg_2', 1050]]);
  assert.equal(withRefunds.refunds?.pending.some((item) => 'raw' in item), false);
  assert.equal('pendingRefunds' in withRefunds, false);
  assert.equal(withoutRefunds.refunds, null);
});

test('dashboard SSE sends dashboard data only with dashboard permission and refunds/refund events only with transactions permission', async (t) => {
  process.env.REALTIME_PING_INTERVAL_MS = '1000';
  t.mock.timers.enable({ apis: ['setInterval'] });
  const refunds = { pendingCount: 1, pendingAmount: 4000, pending: [{ chargeId: 'chrg_1' }] };
  stub(t, dashboardService, {
    getDashboardSummary: async ({ includeRefunds }) => ({ summaryCards: { totalTickets: 1 }, refunds: includeRefunds ? refunds : null }),
    getDashboardRefunds: async () => ({ refunds }),
  });

  // เปิด stream ของผู้ใช้ที่มีสิทธิ์ต่างกัน
  const open = async (permissions: string[]) => {
    const stream = mockSse({ id: `u_${permissions.join('_')}`, permissions });
    t.after(() => stream.req.emit('close'));
    await sse.openDashboardEventStream(stream.req, stream.res);
    return stream.events;
  };
  const dashboardOnly = await open(['dashboard']);
  const transactionsOnly = await open(['transactions']);
  const both = await open(['dashboard', 'transactions']);

  appEvents.emit('refund_event', { type: 'refund_required', chargeId: 'chrg_2', applied: false, pendingCount: 2, pendingAmount: 6000, at: 'now' });
  appEvents.emit('refund_event', { type: 'refund_resolved', chargeId: 'chrg_1', pendingCount: 1, pendingAmount: 2000, at: 'now' });
  appEvents.emit('payment_settings_updated', { type: 'payment_settings_updated' });
  appEvents.emit('device_alert', { type: 'device_ip_blocked', deviceId: 'K-1', deviceName: 'Kiosk 1', deviceType: 'kiosk', ip: '10.0.0.9', previousIp: '10.0.0.5', at: 'now' });
  emitDashboardUpdated('gateway_refund_resolved', { id: 't_1', plateNo: 'กข1234' });
  await new Promise(setImmediate);

  const types = (events: typeof both) => events.map((event) => event.type);
  assert.deepEqual(types(dashboardOnly), ['connected', 'dashboard_snapshot', 'dashboard_updated']);
  assert.deepEqual(types(transactionsOnly), ['connected', 'dashboard_snapshot', 'refund_required', 'refund_resolved', 'payment_settings_updated', 'device_ip_blocked', 'dashboard_updated']);
  assert.deepEqual(types(both), types(transactionsOnly));

  // ไม่มีสิทธิ์ dashboard ได้แค่ refunds, ไม่มีสิทธิ์ transactions ได้ refunds เป็น null
  assert.deepEqual(transactionsOnly[1]?.data, { refunds });
  assert.deepEqual(transactionsOnly[6]?.data, { refunds });
  assert.deepEqual(dashboardOnly[1]?.data, { summaryCards: { totalTickets: 1 }, refunds: null });
  assert.deepEqual(both[6]?.data, { summaryCards: { totalTickets: 1 }, refunds });
  assert.equal(transactionsOnly[2]?.pendingAmount, 6000);
  // แจ้งเตือน IP อุปกรณ์ส่งต่อ payload เดิม เฉพาะผู้ใช้ที่มีสิทธิ์ transactions
  assert.equal(transactionsOnly[5]?.ip, '10.0.0.9');
  assert.equal(both[5]?.ip, '10.0.0.9');
});
