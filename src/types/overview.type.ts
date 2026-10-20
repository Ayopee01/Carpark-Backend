// Import Types
import type { TransactionApi } from './shared/transaction.type';

/* -------------------------------------- Overview Types -------------------------------------- */

// Type query ช่วงวันที่ของ overview (รับทั้ง snake_case และ camelCase)
export interface OverviewQuery {
  start_date?: string;
  end_date?: string;
  startDate?: string;
  endDate?: string;
}

// Type transaction ที่ใช้นับในกราฟ
export type ChartTransaction = Pick<TransactionApi, 'entryAt'>;

// Type แท่งหนึ่งของกราฟการใช้งาน
export interface UsageChartItem {
  label: string;
  value: number;
  date?: string;
  startDate?: string;
  endDate?: string;
  month?: string;
  year?: number;
}

// Type กราฟการใช้งานตามรูปแบบที่เลือก
export interface UsageChart {
  mode: 'daily' | 'weekly' | 'monthly' | 'yearly';
  label: string;
  items: UsageChartItem[];
}

// Type สรุป overview ที่ส่งให้ Admin
export interface OverviewSummary {
  filters: { startDate: string; endDate: string };
  chartFilters: { startDate: string; endDate: string };
  summaryCards: { totalTickets: number; paidCount: number; pendingCount: number; paidRevenue: number; avgWait: null };
  revenueGroups: { id: string; label: string; amount: number; percent: number }[];
  usageChartMode: UsageChart['mode'];
  usageChartLabel: string;
  usageChart: UsageChartItem[];
  serviceSummary: { id: string; label: string; amount: number; count: number; percent: number; icon: string }[];
  totalSummaryCalculated: number;
}
