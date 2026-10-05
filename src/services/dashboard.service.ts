// Import Repositories
import * as chargesRepository from '../repositories/charges.repository';
// Import Services
import * as transactionLookupService from './shared/transaction-lookup.service';
// Import Types
import type { DashboardChannel, DashboardSummary } from '../types/dashboard.type';
// Import Utils
import { bangkokDateToUtcIso, getBangkokParts } from '../utils/date';
import { getPercent, listPaymentsPaidBetween, summarizeRevenue, summarizeTickets } from '../utils/payments';

/* -------------------------------------- Config -------------------------------------- */

// Config ช่องทางชำระเงินที่แสดงบน dashboard (cashier หมายถึง Admin)
const DASHBOARD_CHANNELS: DashboardChannel[] = [
  {
    id: 'ch_cashier',
    code: 'cashier',
    icon: 'user',
    name: 'Cashier',
    label: 'Cashier',
    subLabel: '',
    allowedMethods: ['cash', 'qr', 'promptpay'],
  },
  {
    id: 'ch_kiosk',
    code: 'kiosk',
    icon: 'vending',
    name: 'Kiosk',
    label: 'Kiosk',
    subLabel: '',
    allowedMethods: ['qr', 'promptpay'],
  },
  {
    id: 'ch_mobile',
    code: 'mobile',
    icon: 'qr',
    name: 'Mobile',
    label: 'Mobile',
    subLabel: '',
    allowedMethods: ['qr', 'promptpay'],
  },
  {
    id: 'ch_gate',
    code: 'gate',
    icon: 'gate',
    name: 'Barrier Gate',
    label: 'Barrier Gate',
    subLabel: '',
    allowedMethods: ['qr', 'promptpay'],
  },
];

// Config summary ที่กำลังคำนวณอยู่ ให้ SSE หลาย connection ที่ขอพร้อมกันใช้ผลเดียวกัน
let pendingSummary: Promise<DashboardSummary> | null = null;

/* -------------------------------------- Helpers -------------------------------------- */

// Function สร้างช่วงเวลาเริ่มต้นและสิ้นสุดของวันนี้ตามเวลา Bangkok
function getTodayRange(): { startDate: string; endDate: string } {
  const { year, month, day } = getBangkokParts(new Date());

  return {
    startDate: bangkokDateToUtcIso(year, month, day, 0, 0, 0, 0),
    endDate: bangkokDateToUtcIso(year, month, day, 23, 59, 59, 999)
  };
}

// Function คำนวณสรุป dashboard ของวันนี้ (จำนวนบัตรนับตามวันที่เข้า, รายได้นับตามวันที่จ่ายเงิน)
async function buildDashboardSummary(): Promise<DashboardSummary> {
  const { startDate, endDate } = getTodayRange();
  const [enteredToday, paymentRows, pendingRefunds] = await Promise.all([
    transactionLookupService.listAllTransactions({ startDate, endDate }),
    transactionLookupService.listPaymentRowsSince(startDate),
    chargesRepository.summarizePendingRefunds(),
  ]);
  const revenue = summarizeRevenue(listPaymentsPaidBetween(paymentRows, startDate, endDate));

  return {
    summaryCards: { ...summarizeTickets(enteredToday), paidRevenue: revenue.total },
    revenueGroups: [
      { id: 'staff', amount: revenue.staff, percent: getPercent(revenue.staff, revenue.total) },
      { id: 'scan', amount: revenue.scan, percent: getPercent(revenue.scan, revenue.total) },
    ],
    channelBreakdown: DASHBOARD_CHANNELS.map((channel) => ({
      ...channel,
      ...revenue.byChannel[channel.code],
      percent: getPercent(revenue.byChannel[channel.code].amount, revenue.total),
    })),
    // เงินจาก Omise ที่รอ Admin คืน (ไม่นับในรายได้) amount เป็นบาท
    pendingRefunds: { count: pendingRefunds.count, amount: pendingRefunds.amount / 100 },
    isRealtime: true as const,
  };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงสรุป dashboard ของวันนี้ ถ้ามีการคำนวณที่กำลังทำอยู่ใช้ผลเดียวกัน
async function getDashboardSummary(): Promise<DashboardSummary> {
  if (!pendingSummary) pendingSummary = buildDashboardSummary().finally(() => { pendingSummary = null; });
  return pendingSummary;
}

export { getDashboardSummary };
