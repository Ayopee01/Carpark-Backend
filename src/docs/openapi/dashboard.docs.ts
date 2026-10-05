// Import Docs
import { bearer403, ok } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Dashboard
const paths = {
  '/api/dashboard': {
    get: {
      tags: ['Dashboard'],
      summary: 'Get today dashboard summary',
      description: 'Requires permission: dashboard. Ticket counts are based on transactions created/entered today in Bangkok time. Payment totals are based on payments with paidAt today. Pending count includes pending and partially_paid transactions created today. Paid count includes today transactions with paid_waiting_exit or completed status. Staff revenue includes cashier cash payments only. Scan revenue includes PromptPay/QR payments across cashier, kiosk, gate, and mobile channels. Channel breakdown separates cashier, mobile, kiosk, and gate; cashier covers Admin cash/QR by channel cashier, mobile uses channel mobile, kiosk uses channel kiosk, and barrier gate uses channel gate. pendingRefunds { count, amount (THB) } shows Omise money waiting for an Admin refund (see /api/payments/refunds).',
      responses: { 200: ok('Dashboard summary'), ...bearer403 },
    },
  },
  '/api/dashboard/events': {
    get: {
      tags: ['Dashboard'],
      summary: 'Dashboard Server-Sent Events stream',
      description: 'Requires permission: dashboard. Push-only (no server polling). Sends an initial dashboard_snapshot, ping keepalives, and dashboard_updated events after transaction changes. When the Bangkok date changes, the next ping also sends dashboard_updated with trigger.reason day_changed so the screen switches to the new day. Admin streams send session_revoked { reason } and close when the session is logged out, revoked, expired, or the user is disabled/deleted (reason: logout, refresh_token_reused, session_revoked, session_expired, session_idle_expired, session_not_found, user_disabled, user_deleted). Refreshing the access token does not require reopening the stream.',
      responses: {
        200: { description: 'SSE stream' },
        ...bearer403,
      },
    },
  },
};

export default paths;
