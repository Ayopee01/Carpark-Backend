// Import Types
import type { ReportChannel } from './shared/transaction.type';

/* -------------------------------------- Dashboard Types -------------------------------------- */

// Type ช่องทางชำระเงินที่แสดงบน dashboard
export interface DashboardChannel {
  id: string;
  code: ReportChannel;
  icon: string;
  name: string;
  label: string;
  subLabel: string;
  allowedMethods: string[];
}

// Type สรุป dashboard ของวันนี้
export interface DashboardSummary {
  summaryCards: { totalTickets: number; paidCount: number; pendingCount: number; paidRevenue: number };
  revenueGroups: { id: string; amount: number; percent: number }[];
  channelBreakdown: (DashboardChannel & { amount: number; count: number; percent: number })[];
  pendingRefunds: { count: number; amount: number };
  isRealtime: true;
}
