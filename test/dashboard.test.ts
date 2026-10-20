// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { stub } from './support/mock';
import { getBangkokTodayRange, mockTransactions, payment, transaction } from './support/report';
import { mockSse } from './support/sse';
// Import Services
import * as dashboardService from '../src/services/dashboard.service';
import * as overviewService from '../src/services/overview.service';
// Import Realtime
import * as sse from '../src/realtime/sse';
// Import Utils
import { emitSessionRevoked } from '../src/utils/events';

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
  const summary = await dashboardService.getDashboardSummary();

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

  const dashboard = await dashboardService.getDashboardSummary();
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

  // Mock req/res ขั้นต่ำของ SSE
  const { req, res, events } = mockSse();
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
  const { req, res, events, isEnded } = mockSse({ id: 'u_1' });
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
