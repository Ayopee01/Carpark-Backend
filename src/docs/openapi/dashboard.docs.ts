// Import Docs
import { bearer403, ok } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Dashboard
const paths = {
  '/api/dashboard': {
    get: {
      tags: ['Dashboard'],
      summary: 'Get today dashboard summary',
      description: 'Requires permission: dashboard. Ticket counts are based on transactions created/entered today in Bangkok time. Payment totals are based on payments with paidAt today. Pending count includes pending and partially_paid transactions created today. Paid count includes today transactions with paid_waiting_exit or completed status. Staff revenue includes cashier cash payments only. Scan revenue includes PromptPay/QR payments across cashier, kiosk, gate, and mobile channels. Channel breakdown separates cashier, mobile, kiosk, and gate; cashier covers Admin cash/QR by channel cashier, mobile uses channel mobile, kiosk uses channel kiosk, and barrier gate uses channel gate. refunds { pendingCount, pendingAmount, pending: [refund item] } lists every Omise charge still waiting for an Admin refund (not limited to today, not counted as revenue); pendingAmount is in satang. refunds is null when the user does not have the transactions permission. Refund item (same shape as refundHistory[] of GET /api/overview, raw Omise charge never included): id, provider, chargeId, transactionId, plateNo, amount, currency, method, channel, status, paidAt, processedAt, refundAmount, refundReason (already_paid, transaction_not_payable, transaction_not_found, overpaid), refundResolvedAt, refundNote, refundResolvedBy, refundMethod (manual once resolved), refundId, createdAt, updatedAt. amount and refundAmount are in satang. Resolve with POST /api/payments/refunds/{chargeId}/resolve. pendingRefunds (THB) was removed; use refunds.pendingCount and refunds.pendingAmount / 100.',
      responses: { 200: ok('Dashboard summary'), ...bearer403 },
    },
  },
};

export default paths;
