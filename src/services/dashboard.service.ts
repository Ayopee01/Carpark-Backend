// Import Library
import { endOfDay, startOfDay } from 'date-fns';
// Import Repositories
import * as dashboardRepository from '../repositories/dashboard.repository';
import * as chargeRepository from '../repositories/shared/charge.repository';
// Import Services
import * as omisePaymentService from './shared/omise-payment.service';
import * as transactionLookupService from './shared/transaction-lookup.service';
// Import Types
import type { DashboardChannel, DashboardRefunds, DashboardRefundsOnly, DashboardStats, DashboardSummary } from '../types/dashboard.type';
// Import Utils
import { inBangkok, toUtcIso } from '../utils/date';
import { getPercent, listPaymentsPaidBetween, summarizeRevenue, summarizeTickets } from '../utils/revenue';

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

// Config สถิติที่กำลังคำนวณอยู่ ให้ Socket.IO หลาย connection ที่ขอพร้อมกันใช้ผลเดียวกัน
let pendingStats: Promise<DashboardStats> | null = null;

/* -------------------------------------- Helpers -------------------------------------- */

// Function สร้างช่วงเวลาเริ่มต้นและสิ้นสุดของวันนี้ตามเวลา Bangkok
function getTodayRange(): { startDate: string; endDate: string } {
  const now = new Date();

  return {
    startDate: toUtcIso(startOfDay(now, { in: inBangkok })),
    endDate: toUtcIso(endOfDay(now, { in: inBangkok }))
  };
}

// Function คำนวณสถิติ dashboard ของวันนี้ (จำนวนบัตรนับตามวันที่เข้า, รายได้นับตามวันที่จ่ายเงิน)
async function buildDashboardStats(): Promise<DashboardStats> {
  const { startDate, endDate } = getTodayRange();
  const [enteredToday, paymentRows] = await Promise.all([
    transactionLookupService.listAllTransactions({ startDate, endDate }),
    transactionLookupService.listPaymentRowsSince(startDate),
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
    isRealtime: true as const,
  };
}

// Function ดึงเงินจาก Omise ที่รอ Admin คืนทั้งหมด (ไม่นับในรายได้ ไม่จำกัดวัน) ยอดเป็นสตางค์ ไม่ส่ง raw ของ Omise
// ไม่ใช้ผลร่วมกับ request อื่น เพราะ query ที่เริ่มก่อน resolve commit จะได้รายการเก่าหลังได้ refund_resolved
async function getPendingRefunds(): Promise<DashboardRefunds> {
  const [charges, summary] = await Promise.all([
    dashboardRepository.listRefundGatewayCharges({ resolved: false }),
    chargeRepository.summarizePendingRefunds(),
  ]);
  return { pendingCount: summary.count, pendingAmount: summary.amount, pending: charges.map((charge) => omisePaymentService.toGatewayChargeEvent(charge)) };
}

// Function ดึงสถิติ dashboard ของวันนี้ ถ้ามีการคำนวณที่กำลังทำอยู่ใช้ผลเดียวกัน
function getDashboardStats(): Promise<DashboardStats> {
  if (!pendingStats) pendingStats = buildDashboardStats().finally(() => { pendingStats = null; });
  return pendingStats;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงสรุป dashboard ของวันนี้ (includeRefunds = ผู้ใช้มีสิทธิ์ transactions ถ้าไม่มี refunds เป็น null)
async function getDashboardSummary({ includeRefunds }: { includeRefunds: boolean }): Promise<DashboardSummary> {
  const [stats, refunds] = await Promise.all([getDashboardStats(), includeRefunds ? getPendingRefunds() : null]);
  return { ...stats, refunds };
}

// Function ดึงเฉพาะรายการรอคืนเงิน ใช้กับ dashboard stream ของ Socket.IO ของผู้ใช้ที่มีแค่สิทธิ์ transactions
async function getDashboardRefunds(): Promise<DashboardRefundsOnly> {
  return { refunds: await getPendingRefunds() };
}

export { getDashboardRefunds, getDashboardSummary };
