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
  '/api/dashboard/events': {
    get: {
      tags: ['Dashboard'],
      summary: 'Dashboard Server-Sent Events stream',
      description: 'Requires permission: dashboard or transactions (either one). Open once in the Admin layout: it drives the dashboard and the refund alert/badge on every page. Push-only (no server polling). Sends connected, an initial dashboard_snapshot { trigger, data, generatedAt }, ping keepalives, and dashboard_updated after transaction/payment changes (including refund required/resolved). With the dashboard permission, data is the same object as GET /api/dashboard (refunds null without the transactions permission) and, when the Bangkok date changes, the next ping also sends dashboard_updated with trigger.reason day_changed. With only the transactions permission, data is { refunds } (no dashboard statistics). Users with the transactions permission also receive refund_required (a successful Omise charge could not be applied or was more than the fee; applied false = refund the whole charge, true with refundReason overpaid = only refundAmount; carries chargeId, transactionId, plateNo, method, channel, amount, refundAmount, refundReason, paidAt, refundMethod), refund_resolved (chargeId, transactionId, plateNo, resolvedBy, refundNote, refundResolvedAt, refundMethod, refundId), payment_settings_updated (reload GET /api/payments/methods), and device IP alerts device_ip_changed / device_ip_blocked (deviceId, deviceName, deviceType, ip, previousIp, at; repeated at most once per 15 minutes for the same device and IP). refund_required and refund_resolved carry pendingCount and pendingAmount (satang) after the event, and at; the dashboard_updated sent for the same change carries the full refunds list. Events that happen while disconnected are not replayed; dashboard_snapshot on reconnect has the current refunds. Admin streams send session_revoked { reason } and close when the session is logged out, revoked, expired, or the user is disabled/deleted (reason: logout, refresh_token_reused, session_revoked, session_expired, session_idle_expired, session_not_found, user_disabled, user_deleted). Refreshing the access token does not require reopening the stream.',
      responses: {
        200: { description: 'SSE stream' },
        ...bearer403,
      },
    },
  },
};

export default paths;
