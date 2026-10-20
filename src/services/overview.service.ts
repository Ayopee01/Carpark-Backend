// Import Services
import * as transactionLookupService from './shared/transaction-lookup.service';
// Import Types
import type { ChartTransaction, OverviewQuery, OverviewSummary, UsageChart, UsageChartItem } from '../types/overview.type';
import type { BangkokDateParts } from '../types/shared/common.type';
import type { ReportChannel } from '../types/shared/transaction.type';
// Import Utils
import { ApiError } from '../utils/api-error';
import { bangkokDateToUtcIso, getBangkokParts, parseBangkokDateTime } from '../utils/date';
import { getPercent, listPaymentsPaidBetween, summarizeRevenue, summarizeTickets } from '../utils/payments';

/* -------------------------------------- Config -------------------------------------- */

// Config จำนวน milliseconds ต่อวัน ใช้แปลงวันที่เป็น serial ของวัน
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

// Function เติมเลข 0 ด้านหน้าถ้าเลขมีหลักเดียว
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

// Function แปลง date-only string เป็น UTC ISO ตาม mode start/end
function dateOnlyToUtcIso(value: string, mode: 'start' | 'end'): string {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);

  if (mode === 'end') {
    return bangkokDateToUtcIso(year, month, day, 23, 59, 59, 999);
  }

  return bangkokDateToUtcIso(year, month, day, 0, 0, 0, 0);
}

// Function ตรวจว่า y/m/d เป็นวันที่ที่มีอยู่จริง (กัน 2026-02-31 ถูกปัดเป็นเดือนถัดไป)
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Function parse query date ให้เป็น ISO string (วันที่ไม่ถูกต้องคืน null)
function parseDateInput(value: unknown, mode: 'start' | 'end'): string | null {
  if (!value) return null;

  const text = String(value).trim();
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd && !isValidCalendarDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))) return null;

  if (DATE_ONLY_PATTERN.test(text)) {
    return dateOnlyToUtcIso(text, mode);
  }

  const date = parseBangkokDateTime(text);
  return date ? date.toISOString() : null;
}

// Function สร้าง default range ตั้งแต่ต้นเดือนถึงเวลาปัจจุบัน
function getDefaultRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const { year, month } = getBangkokParts(now);

  return {
    startDate: bangkokDateToUtcIso(year, month, 1, 0, 0, 0, 0),
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

// Function แปลง y/m/d เป็น serial number ของวัน
function getDateSerialFromYmd(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

// Function แปลง serial number กลับเป็น y/m/d
function getYmdFromSerial(serial: number): BangkokDateParts {
  const date = new Date(serial * MS_PER_DAY);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

// Function อ่าน serial number จาก transaction entryAt
function getTransactionSerial(transaction: ChartTransaction): number {
  const parts = getBangkokParts(transaction.entryAt);
  return getDateSerialFromYmd(parts.year, parts.month, parts.day);
}

// Function คำนวณ serial ของวันเริ่มและวันสิ้นสุดตามเวลา Bangkok
function getRangeSerials(startDate: string, endDate: string): { startParts: BangkokDateParts; endParts: BangkokDateParts; startSerial: number; endSerial: number } {
  const startParts = getBangkokParts(startDate);
  const endParts = getBangkokParts(endDate);
  const startSerial = getDateSerialFromYmd(startParts.year, startParts.month, startParts.day);
  const endSerial = getDateSerialFromYmd(endParts.year, endParts.month, endParts.day);

  return {
    startParts,
    endParts,
    startSerial,
    endSerial
  };
}

// Function คำนวณ index วันในสัปดาห์แบบเริ่มวันจันทร์
function getWeekdayIndexMondayFirst(year: number, month: number, day: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayIndex = date.getUTCDay();

  return dayIndex === 0 ? 6 : dayIndex - 1;
}

// Function นับ transaction ในช่วง serial date
function countTransactionsInSerialRange(transactions: ChartTransaction[], fromSerial: number, toSerial: number): number {
  return transactions.filter((transaction) => {
    const serial = getTransactionSerial(transaction);
    return serial >= fromSerial && serial <= toSerial;
  }).length;
}

// Function สร้างกราฟรายวัน (แท่งละ 1 วันตามช่วงที่กรอง)
function buildDailyUsageChart(transactions: ChartTransaction[], startSerial: number, endSerial: number): UsageChart {
  const items: UsageChartItem[] = [];

  for (let serial = startSerial; serial <= endSerial; serial += 1) {
    const ymd = getYmdFromSerial(serial);

    items.push({
      label: DAY_LABELS[getWeekdayIndexMondayFirst(ymd.year, ymd.month, ymd.day)] ?? '',
      date: `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day)}`,
      value: countTransactionsInSerialRange(transactions, serial, serial)
    });
  }

  return {
    mode: 'daily' as const,
    label: 'รายวัน',
    items
  };
}

// Function สร้างกราฟรายสัปดาห์ (ช่วงละ 7 วันนับจากวันเริ่มกรอง ช่วงสุดท้ายอาจไม่ครบ 7 วัน)
function buildWeeklyUsageChart(transactions: ChartTransaction[], startSerial: number, endSerial: number): UsageChart {
  const items: UsageChartItem[] = [];
  let cursor = startSerial;
  let weekIndex = 1;

  while (cursor <= endSerial) {
    const weekEnd = Math.min(cursor + 6, endSerial);
    const from = getYmdFromSerial(cursor);
    const to = getYmdFromSerial(weekEnd);

    items.push({
      label: `สัปดาห์ ${weekIndex} (${from.day}/${from.month})`,
      startDate: `${from.year}-${pad2(from.month)}-${pad2(from.day)}`,
      endDate: `${to.year}-${pad2(to.month)}-${pad2(to.day)}`,
      value: countTransactionsInSerialRange(transactions, cursor, weekEnd)
    });

    cursor = weekEnd + 1;
    weekIndex += 1;
  }

  return {
    mode: 'weekly' as const,
    label: 'รายสัปดาห์',
    items
  };
}

// Function นับ transaction ตาม key ของวันที่เข้า (เวลา Bangkok)
function countTransactionsByKey(transactions: ChartTransaction[], getKey: (parts: BangkokDateParts) => string): Map<string, number> {
  const counts = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (!transaction.entryAt) return;

    const key = getKey(getBangkokParts(transaction.entryAt));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

// Function สร้างกราฟรายเดือน (ทุกเดือนในช่วงที่กรอง เดือนที่ไม่มีข้อมูลเป็น 0)
function buildMonthlyUsageChart(transactions: ChartTransaction[], startParts: BangkokDateParts, endParts: BangkokDateParts): UsageChart {
  const counts = countTransactionsByKey(transactions, (parts) => `${parts.year}-${pad2(parts.month)}`);
  const items: UsageChartItem[] = [];
  let { year, month } = startParts;

  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    const key = `${year}-${pad2(month)}`;
    items.push({ label: `${MONTH_LABELS[month - 1]} ${year}`, month: key, value: counts.get(key) || 0 });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return {
    mode: 'monthly' as const,
    label: 'รายเดือน',
    items
  };
}

// Function สร้างกราฟรายปี (ทุกปีในช่วงที่กรอง ปีที่ไม่มีข้อมูลเป็น 0)
function buildYearlyUsageChart(transactions: ChartTransaction[], startParts: BangkokDateParts, endParts: BangkokDateParts): UsageChart {
  const counts = countTransactionsByKey(transactions, (parts) => String(parts.year));
  const items: UsageChartItem[] = [];

  for (let year = startParts.year; year <= endParts.year; year += 1) {
    items.push({ label: String(year), year, value: counts.get(String(year)) || 0 });
  }

  return {
    mode: 'yearly' as const,
    label: 'รายปี',
    items
  };
}

// Function เลือกรูปแบบกราฟตามช่วงที่กรอง: ≤7 วันรายวัน, ≤31 วันรายสัปดาห์, ≤12 เดือนรายเดือน, นอกนั้นรายปี
function buildUsageChart(transactions: ChartTransaction[], startDate: string, endDate: string): UsageChart {
  const { startParts, endParts, startSerial, endSerial } = getRangeSerials(startDate, endDate);
  const dayCount = endSerial - startSerial + 1;
  const monthCount = (endParts.year - startParts.year) * 12 + (endParts.month - startParts.month) + 1;

  if (dayCount <= MAX_DAILY_CHART_DAYS) return buildDailyUsageChart(transactions, startSerial, endSerial);
  if (dayCount <= MAX_WEEKLY_CHART_DAYS) return buildWeeklyUsageChart(transactions, startSerial, endSerial);
  if (monthCount <= MAX_MONTHLY_CHART_MONTHS) return buildMonthlyUsageChart(transactions, startParts, endParts);

  return buildYearlyUsageChart(transactions, startParts, endParts);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้างสรุป overview ตามช่วงวันที่ (default ต้นเดือนถึงปัจจุบันตามเวลา Bangkok)
async function getOverviewSummary(query: OverviewQuery = {}): Promise<OverviewSummary> {
  const { startDate, endDate } = getRangeFromQuery(query);
  if (!startDate || !endDate) throw new ApiError(400, 'INVALID_DATE_RANGE', 'Invalid start_date or end_date');
  if (new Date(startDate) > new Date(endDate)) throw new ApiError(400, 'INVALID_DATE_RANGE', 'start_date must not be after end_date');

  const [enteredInRange, paymentRows] = await Promise.all([
    transactionLookupService.listAllTransactions({ startDate, endDate }),
    transactionLookupService.listPaymentRowsSince(startDate),
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
    totalSummaryCalculated: revenue.total
  };
}

export { getOverviewSummary };
