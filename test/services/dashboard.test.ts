// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture } from '../support/mock';
import { getBangkokTodayRange, mockTransactions, payment, transaction } from '../support/report';
// Import Services
import * as dashboardService from '../../src/services/dashboard.service';
import * as overviewService from '../../src/services/overview.service';
// Import Types
import type { GatewayChargeApi } from '../../src/types/shared/payment.type';

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
