// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { mockTransactions, transaction } from './support/report';
// Import Services
import * as overviewService from '../src/services/overview.service';

/* -------------------------------------- Tests -------------------------------------- */

test('overview usage chart covers exactly the filtered range and fills empty periods with 0', async (t) => {
  mockTransactions(t, [
    transaction('sep_28', { entryAt: '2026-09-28T02:00:00.000Z' }),
    transaction('oct_05', { entryAt: '2026-10-05T03:00:00.000Z' }),
    transaction('may_01', { entryAt: '2026-05-01T03:00:00.000Z' }),
  ]);

  // ≤7 วัน แท่งละวันเฉพาะวันที่กรอง แม้ข้ามสัปดาห์
  const daily = await overviewService.getOverviewSummary({ start_date: '2026-10-03', end_date: '2026-10-06' });
  assert.equal(daily.usageChartMode, 'daily');
  assert.deepEqual(daily.usageChart.map((item) => [item.label, item.date, item.value]), [
    ['เสาร์', '2026-10-03', 0], ['อาทิตย์', '2026-10-04', 0], ['จันทร์', '2026-10-05', 1], ['อังคาร', '2026-10-06', 0],
  ]);
  assert.deepEqual(daily.chartFilters, daily.filters);

  // 8-31 วัน รายสัปดาห์ ช่วงละ 7 วันนับจากวันเริ่ม
  const weekly = await overviewService.getOverviewSummary({ start_date: '2026-09-28', end_date: '2026-10-05' });
  assert.equal(weekly.usageChartMode, 'weekly');
  assert.deepEqual(weekly.usageChart.map((item) => [item.startDate, item.endDate, item.value]), [
    ['2026-09-28', '2026-10-04', 1], ['2026-10-05', '2026-10-05', 1],
  ]);

  // ≤12 เดือน รายเดือนครบทุกเดือน
  const monthly = await overviewService.getOverviewSummary({ start_date: '2026-01-01', end_date: '2026-12-31' });
  assert.equal(monthly.usageChartMode, 'monthly');
  assert.equal(monthly.usageChart.length, 12);
  assert.deepEqual(monthly.usageChart.filter((item) => item.value).map((item) => [item.month, item.value]), [['2026-05', 1], ['2026-09', 1], ['2026-10', 1]]);

  // เกิน 12 เดือน รายปีครบทุกปี
  const yearly = await overviewService.getOverviewSummary({ start_date: '2025-01-01', end_date: '2026-12-31' });
  assert.deepEqual(yearly.usageChart.map((item) => [item.label, item.value]), [['2025', 0], ['2026', 3]]);
});

test('overview rejects dates that do not exist and reversed ranges', async (t) => {
  mockTransactions(t, []);

  for (const query of [{ start_date: '2026-02-31' }, { start_date: '2026-13-01' }, { start_date: 'abc' }, { start_date: '2026-09-30', end_date: '2026-09-01' }]) {
    await assert.rejects(overviewService.getOverviewSummary(query), { statusCode: 400, code: 'INVALID_DATE_RANGE' });
  }
});

test('overview reads a date-time without timezone as Bangkok time', async (t) => {
  mockTransactions(t, [transaction('after_midnight_bkk', { entryAt: '2026-09-29T17:30:00.000Z' })]);

  const overview = await overviewService.getOverviewSummary({ start_date: '2026-09-30T00:00', end_date: '2026-09-30T01:00' });

  assert.equal(overview.filters.startDate, '2026-09-29T17:00:00.000Z');
  assert.equal(overview.summaryCards.totalTickets, 1);
});
