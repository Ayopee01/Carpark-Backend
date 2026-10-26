// Import Library
import { differenceInCalendarDays, differenceInCalendarMonths, eachDayOfInterval, eachMonthOfInterval, eachYearOfInterval, endOfDay, format, getISODay, getMonth, getYear, isExists, startOfDay, startOfMonth } from 'date-fns';
// Import Repositories
import * as chargesRepository from '../repositories/charges.repository';
// Import Mappers
import { toGatewayChargeEvent } from '../repositories/mappers/charge.mapper';
// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
import * as edcReconciliationService from './shared/edc-reconciliation.service';
import * as transactionLookupService from './shared/transaction-lookup.service';
// Import Types
import type { RefundListItem } from '../types/dashboard.type';
import type { ChartTransaction, OverviewEdcReconciliation, OverviewOptions, OverviewQuery, OverviewSummary, UsageChart, UsageChartItem } from '../types/overview.type';
import type { EdcReconciliationSummary } from '../types/payments.type';
import type { SafeDevice } from '../types/shared/device.type';
import type { ReportChannel } from '../types/shared/transaction.type';
// Import Utils
import { ApiError } from '../utils/api-error';
import { formatBangkok, inBangkok, parseBangkokDateTime, toUtcIso } from '../utils/date';
import { getPercent, listPaymentsPaidBetween, summarizeRevenue, summarizeTickets } from '../utils/payments';

/* -------------------------------------- Config -------------------------------------- */

// Config รายการช่องทางบริการในสรุป overview (channel คือ key ของยอดแยกตาม channel)
const CHANNELS: { id: string; label: string; icon: string; channel: ReportChannel }[] = [
  { id: 'cashier', label: 'เงินสด (Cashier)', icon: 'cash', channel: 'cashier' },
  { id: 'epayment', label: 'E-payment', icon: 'qr', channel: 'mobile' },
  { id: 'kiosk', label: 'Kiosk', icon: 'kiosk', channel: 'kiosk' },
  { id: 'gate', label: 'หน้าทางออก', icon: 'gate', channel: 'gate' },
];

// Config label วันในสัปดาห์ของกราฟ (เริ่มวันจันทร์)
const DAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

// Config label เดือนของกราฟ
const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Config จำนวนวันสูงสุดของกราฟรายวัน (เกินนี้เป็นรายสัปดาห์)
const MAX_DAILY_CHART_DAYS = 7;

// Config จำนวนวันสูงสุดของกราฟรายสัปดาห์ (สัปดาห์ละ 7 วัน ได้ไม่เกิน 5 แท่ง)
const MAX_WEEKLY_CHART_DAYS = 31;

// Config จำนวนเดือนสูงสุดของกราฟรายเดือน (เกินนี้เป็นรายปี)
const MAX_MONTHLY_CHART_MONTHS = 12;

// Config รูปแบบวันที่อย่างเดียว YYYY-MM-DD
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลง date-only string (เวลาไทย) เป็น UTC ISO ของต้นวัน (start) หรือท้ายวัน (end)
function dateOnlyToUtcIso(value: string, mode: 'start' | 'end'): string {
  const day = startOfDay(parseBangkokDateTime(value) ?? Number.NaN, { in: inBangkok });
  return toUtcIso(mode === 'end' ? endOfDay(day, { in: inBangkok }) : day);
}

// Function parse query date ให้เป็น ISO string (วันที่ไม่ถูกต้องคืน null)
function parseDateInput(value: unknown, mode: 'start' | 'end'): string | null {
  if (!value) return null;

  const text = String(value).trim();
  // กัน 2026-02-31 ถูกปัดเป็นเดือนถัดไป
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd && !isExists(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))) return null;

  if (DATE_ONLY_PATTERN.test(text)) {
    return dateOnlyToUtcIso(text, mode);
  }

  const date = parseBangkokDateTime(text);
  return date ? date.toISOString() : null;
}

// Function สร้าง default range ตั้งแต่ต้นเดือนถึงเวลาปัจจุบัน
function getDefaultRange(): { startDate: string; endDate: string } {
  const now = new Date();

  return {
    startDate: toUtcIso(startOfMonth(now, { in: inBangkok })),
    endDate: now.toISOString()
  };
}

// Function อ่านช่วงวันที่จาก query
function getRangeFromQuery(query: OverviewQuery): { startDate: string | null; endDate: string | null } {
  const queryStart = query.start_date || query.startDate;
  const queryEnd = query.end_date || query.endDate;

  if (!queryStart && !queryEnd) {
    return getDefaultRange();
  }

  return {
    startDate: parseDateInput(queryStart || queryEnd, 'start'),
    endDate: parseDateInput(queryEnd || queryStart, 'end')
  };
}

// Function นับ transaction ตามวันที่เข้า (เวลา Bangkok) จัดกลุ่มด้วย pattern ของ date-fns เช่น yyyy-MM-dd, yyyy-MM, yyyy
function countTransactionsByKey(transactions: ChartTransaction[], pattern: string): Map<string, number> {
  const counts = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (!transaction.entryAt) return;

    const key = formatBangkok(transaction.entryAt, pattern);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

// Function สร้างกราฟรายวัน (แท่งละ 1 วันตามช่วงที่กรอง label เป็นวันในสัปดาห์เริ่มวันจันทร์)
function buildDailyUsageChart(transactions: ChartTransaction[], days: Date[]): UsageChart {
  const counts = countTransactionsByKey(transactions, 'yyyy-MM-dd');
  const items: UsageChartItem[] = days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    return { label: DAY_LABELS[getISODay(day) - 1] ?? '', date, value: counts.get(date) || 0 };
  });

  return {
    mode: 'daily' as const,
    label: 'รายวัน',
    items
  };
}

// Function สร้างกราฟรายสัปดาห์ (ช่วงละ 7 วันนับจากวันเริ่มกรอง ช่วงสุดท้ายอาจไม่ครบ 7 วัน)
function buildWeeklyUsageChart(transactions: ChartTransaction[], days: Date[]): UsageChart {
  const counts = countTransactionsByKey(transactions, 'yyyy-MM-dd');
  const items: UsageChartItem[] = [];

  for (let index = 0; index < days.length; index += 7) {
    const week = days.slice(index, index + 7);
    const from = week[0] as Date;
    const to = week[week.length - 1] as Date;

    items.push({
      label: `สัปดาห์ ${index / 7 + 1} (${format(from, 'd/M')})`,
      startDate: format(from, 'yyyy-MM-dd'),
      endDate: format(to, 'yyyy-MM-dd'),
      value: week.reduce((sum, day) => sum + (counts.get(format(day, 'yyyy-MM-dd')) || 0), 0)
    });
  }

  return {
    mode: 'weekly' as const,
    label: 'รายสัปดาห์',
    items
  };
}

// Function สร้างกราฟรายเดือน (ทุกเดือนในช่วงที่กรอง เดือนที่ไม่มีข้อมูลเป็น 0)
function buildMonthlyUsageChart(transactions: ChartTransaction[], start: Date, end: Date): UsageChart {
  const counts = countTransactionsByKey(transactions, 'yyyy-MM');
  const items: UsageChartItem[] = eachMonthOfInterval({ start, end }, { in: inBangkok }).map((month) => {
    const key = format(month, 'yyyy-MM');
    return { label: `${MONTH_LABELS[getMonth(month)]} ${getYear(month)}`, month: key, value: counts.get(key) || 0 };
  });

  return {
    mode: 'monthly' as const,
    label: 'รายเดือน',
    items
  };
}

// Function สร้างกราฟรายปี (ทุกปีในช่วงที่กรอง ปีที่ไม่มีข้อมูลเป็น 0)
function buildYearlyUsageChart(transactions: ChartTransaction[], start: Date, end: Date): UsageChart {
  const counts = countTransactionsByKey(transactions, 'yyyy');
  const items: UsageChartItem[] = eachYearOfInterval({ start, end }, { in: inBangkok }).map((yearStart) => {
    const year = getYear(yearStart);
    return { label: String(year), year, value: counts.get(String(year)) || 0 };
  });

  return {
    mode: 'yearly' as const,
    label: 'รายปี',
    items
  };
}

// Function เลือกรูปแบบกราฟตามช่วงที่กรอง (นับวัน/เดือนตามเวลา Bangkok): ≤7 วันรายวัน, ≤31 วันรายสัปดาห์, ≤12 เดือนรายเดือน, นอกนั้นรายปี
function buildUsageChart(transactions: ChartTransaction[], startDate: string, endDate: string): UsageChart {
  const start = startOfDay(startDate, { in: inBangkok });
  const end = startOfDay(endDate, { in: inBangkok });
  const dayCount = differenceInCalendarDays(end, start, { in: inBangkok }) + 1;
  const monthCount = differenceInCalendarMonths(end, start, { in: inBangkok }) + 1;

  if (dayCount <= MAX_WEEKLY_CHART_DAYS) {
    const days = eachDayOfInterval({ start, end }, { in: inBangkok });
    return dayCount <= MAX_DAILY_CHART_DAYS ? buildDailyUsageChart(transactions, days) : buildWeeklyUsageChart(transactions, days);
  }
  if (monthCount <= MAX_MONTHLY_CHART_MONTHS) return buildMonthlyUsageChart(transactions, start, end);

  return buildYearlyUsageChart(transactions, start, end);
}

// Function ดึงรายการคืนเงินที่ refundResolvedAt อยู่ในช่วงวันที่ (ไม่ส่ง raw ของ Omise)
async function listRefundHistory(startDate: string, endDate: string): Promise<RefundListItem[]> {
  const charges = await chargesRepository.listResolvedRefundGatewayChargesBetween(startDate, endDate);
  return charges.map((charge) => toGatewayChargeEvent(charge));
}

// Function ตัด terminals[].payments ออกเมื่อไม่ได้ขอ include=edc_payments (รายการบัตรอาจมีหลายพันแถว)
function toOverviewEdcReconciliation(summary: EdcReconciliationSummary, includePayments: boolean): OverviewEdcReconciliation {
  if (includePayments) return summary;
  return { ...summary, terminals: summary.terminals.map(({ payments: _payments, ...terminal }) => terminal) };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้างสรุป overview ตามช่วงวันที่ (default ต้นเดือนถึงปัจจุบันตามเวลา Bangkok)
// refundHistory/edcReconciliation เป็น null ถ้าไม่มีสิทธิ์ transactions, includeEdcPayments ใช้ช่วงได้ไม่เกิน 31 วัน
async function getOverviewSummary(query: OverviewQuery = {}, { includeTransactions, includeEdcPayments = false }: OverviewOptions = { includeTransactions: false }): Promise<OverviewSummary> {
  const { startDate, endDate } = getRangeFromQuery(query);
  if (!startDate || !endDate) throw new ApiError(400, 'INVALID_DATE_RANGE', 'Invalid start_date or end_date');
  if (new Date(startDate) > new Date(endDate)) throw new ApiError(400, 'INVALID_DATE_RANGE', 'start_date must not be after end_date');
  if (includeTransactions && includeEdcPayments) edcReconciliationService.assertEdcPaymentRange(startDate, endDate);

  const [enteredInRange, paymentRows, refundHistory, edcDevices] = await Promise.all([
    transactionLookupService.listAllTransactions({ startDate, endDate }),
    transactionLookupService.listPaymentRowsSince(startDate),
    includeTransactions ? listRefundHistory(startDate, endDate) : null,
    includeTransactions ? deviceRegistryService.listEdcDevices() : ([] as SafeDevice[]),
  ]);
  const transactions = enteredInRange.filter((transaction) => transaction && transaction.status);
  const revenue = summarizeRevenue(listPaymentsPaidBetween(paymentRows, startDate, endDate));

  const revenueGroups = [
    { id: 'staff', label: 'เจ้าหน้าที่ช่วยเหลือ', amount: revenue.staff, percent: getPercent(revenue.staff, revenue.total) },
    { id: 'scan', label: 'สแกนจ่าย', amount: revenue.scan, percent: getPercent(revenue.scan, revenue.total) },
  ];

  const serviceSummary = CHANNELS.map((item) => ({
    id: item.id,
    label: item.label,
    amount: revenue.byChannel[item.channel].amount,
    count: revenue.byChannel[item.channel].count,
    percent: getPercent(revenue.byChannel[item.channel].amount, revenue.total),
    icon: item.icon,
  }));

  // กราฟใช้ช่วงเดียวกับตัวกรอง
  const usageChartResult = buildUsageChart(transactions, startDate, endDate);

  return {
    filters: {
      startDate,
      endDate
    },
    // chartFilters เท่ากับ filters เสมอ คงไว้เพื่อให้ frontend เดิมอ่านได้
    chartFilters: {
      startDate,
      endDate
    },
    summaryCards: {
      ...summarizeTickets(transactions),
      paidRevenue: revenue.total,
      // ยังไม่มีข้อมูลเวลารอจริง จึงคืน null แทนค่าสมมติ
      avgWait: null
    },
    revenueGroups,
    usageChartMode: usageChartResult.mode,
    usageChartLabel: usageChartResult.label,
    usageChart: usageChartResult.items,
    serviceSummary,
    totalSummaryCalculated: revenue.total,
    refundHistory,
    // ใช้ payment rows ชุดเดียวกับรายได้ ยอดตรงกับรายงานกระทบยอด EDC ของช่วงเดียวกัน
    edcReconciliation: includeTransactions
      ? toOverviewEdcReconciliation(edcReconciliationService.summarizeEdcPayments(paymentRows, edcDevices, startDate, endDate), includeEdcPayments)
      : null,
  };
}

export { getOverviewSummary };
