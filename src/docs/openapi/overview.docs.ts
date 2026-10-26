// Import Docs
import { bearer403, error, ok, query } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Overview
const paths = {
  '/api/overview': {
    get: {
      tags: ['Overview'],
      summary: 'Get overview summary by date range',
      description: 'Requires permission: overview. Summarizes the filtered range: ticket counts by entry time, revenue by payments[].paidAt. If only one date is sent it is used for both ends. Without dates the range is the current Bangkok month through now. usageChart covers exactly the filtered range: up to 7 days = daily (one item per day, with date), up to 31 days = weekly (7-day buckets from start_date, with startDate/endDate), up to 12 calendar months = monthly (every month, with month YYYY-MM), otherwise yearly (every year). Periods without data are returned with value 0. chartFilters always equals filters. With the transactions permission the response also has refundHistory and edcReconciliation (both null without it). refundHistory: refunds marked as done whose refundResolvedAt is in the range, newest first (refund item fields as refunds.pending of GET /api/dashboard; amounts in satang). edcReconciliation (amounts in baht): total { count, amount }, missingReferenceCount (card payments without reference, check manually), unverifiedCount (Kiosk/Barrier Gate card payments not verified with the card provider), terminals [{ terminalId, edcDevice { deviceId, deviceName, location, provider, usage } | null, channels, deviceIds, count, amount }] for card payments with paidAt in the range, for any range overview accepts. Add include=edc_payments to also get terminals[].payments [{ transactionId, plateNo, billNo, paymentId, reference, terminalId, edcDeviceId, edcVerification, amount, paidAt, channel, deviceId, processedBy }] (for the EDC tab and CSV export); then the range must not exceed 31 days (400 INVALID_DATE_RANGE). include is ignored without the transactions permission.',
      parameters: [
        query('start_date', { type: 'string', description: 'YYYY-MM-DD (Bangkok day) or ISO date-time. A date-time without timezone is read as Asia/Bangkok. Dates that do not exist (for example 2026-02-31) return 400.' }, '2026-05-01'),
        query('end_date', { type: 'string', description: 'YYYY-MM-DD (Bangkok day) or ISO date-time. A date-time without timezone is read as Asia/Bangkok. Dates that do not exist (for example 2026-02-31) return 400.' }, '2026-05-25'),
        query('include', { type: 'string', enum: ['edc_payments'], description: 'edc_payments = also send edcReconciliation.terminals[].payments (range max 31 days, needs the transactions permission).' }, 'edc_payments'),
      ],
      responses: { 200: ok('Overview summary'), 400: error('INVALID_DATE_RANGE: invalid start_date/end_date, start_date after end_date, or include=edc_payments with a range over 31 days'), ...bearer403 },
    },
  },
  '/api/overview/events': {
    get: {
      tags: ['Overview'],
      summary: 'Overview Server-Sent Events stream',
      description: 'Requires permission: overview. Uses the same start_date/end_date filters as /api/overview. Push-only (no server polling). Sends an initial overview_snapshot, ping keepalives, and overview_updated events after transaction changes (including refunds marked as done). data is the same object as GET /api/overview including refundHistory and edcReconciliation (null without the transactions permission), but never edcReconciliation.terminals[].payments; include is ignored. Admin streams send session_revoked { reason } and close when the session is logged out, revoked, expired, or the user is disabled/deleted (reason: logout, refresh_token_reused, session_revoked, session_expired, session_idle_expired, session_not_found, user_disabled, user_deleted). Refreshing the access token does not require reopening the stream.',
      parameters: [
        query('start_date', { type: 'string', description: 'YYYY-MM-DD (Bangkok day) or ISO date-time. A date-time without timezone is read as Asia/Bangkok. Dates that do not exist (for example 2026-02-31) return 400.' }, '2026-05-01'),
        query('end_date', { type: 'string', description: 'YYYY-MM-DD (Bangkok day) or ISO date-time. A date-time without timezone is read as Asia/Bangkok. Dates that do not exist (for example 2026-02-31) return 400.' }, '2026-05-25'),
      ],
      responses: {
        200: { description: 'SSE stream' },
        400: error('INVALID_DATE_RANGE: invalid start_date/end_date, or start_date after end_date'),
        ...bearer403,
      },
    },
  },

};

export default paths;
