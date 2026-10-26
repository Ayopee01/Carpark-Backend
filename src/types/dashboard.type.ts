// Import Types
import type { GatewayChargeEvent } from './shared/payment.type';
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

// Type รายการเงินจาก Omise ที่ต้องคืน (refunds.pending ของ dashboard และ refundHistory ของ overview ไม่มี raw)
export type RefundListItem = GatewayChargeEvent;

// Type รายการรอคืนเงินบน dashboard (pendingAmount และ refundAmount ของแต่ละรายการเป็นสตางค์)
export interface DashboardRefunds {
  pendingCount: number;
  pendingAmount: number;
  pending: RefundListItem[];
}

// Type สถิติ dashboard ของวันนี้ (ต้องมีสิทธิ์ dashboard)
export interface DashboardStats {
  summaryCards: { totalTickets: number; paidCount: number; pendingCount: number; paidRevenue: number };
  revenueGroups: { id: string; amount: number; percent: number }[];
  channelBreakdown: (DashboardChannel & { amount: number; count: number; percent: number })[];
  isRealtime: true;
}

// Type สรุป dashboard ของวันนี้ (refunds เป็น null เมื่อผู้ใช้ไม่มีสิทธิ์ transactions)
export interface DashboardSummary extends DashboardStats {
  refunds: DashboardRefunds | null;
}

// Type data ของ dashboard_snapshot/dashboard_updated สำหรับผู้ใช้ที่มีแค่สิทธิ์ transactions (ไม่มีสถิติ dashboard)
export interface DashboardRefundsOnly {
  refunds: DashboardRefunds;
}
