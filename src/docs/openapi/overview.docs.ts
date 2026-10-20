// Import Docs
import { bearer403, error, ok, query } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Overview
const paths = {
  '/api/overview': {
    get: {
      tags: ['Overview'],
      summary: 'Get overview summary by date range',
      description: 'Requires permission: overview. Summarizes the filtered range: ticket counts by entry time, revenue by payments[].paidAt. If only one date is sent it is used for both ends. Without dates the range is the current Bangkok month through now. usageChart covers exactly the filtered range: up to 7 days = daily (one item per day, with date), up to 31 days = weekly (7-day buckets from start_date, with startDate/endDate), up to 12 calendar months = monthly (every month, with month YYYY-MM), otherwise yearly (every year). Periods without data are returned with value 0. chartFilters always equals filters.',
      parameters: [
        query('start_date', { type: 'string', description: 'YYYY-MM-DD (Bangkok day) or ISO date-time. A date-time without timezone is read as Asia/Bangkok. Dates that do not exist (for example 2026-02-31) return 400.' }, '2026-05-01'),
        query('end_date', { type: 'string', description: 'YYYY-MM-DD (Bangkok day) or ISO date-time. A date-time without timezone is read as Asia/Bangkok. Dates that do not exist (for example 2026-02-31) return 400.' }, '2026-05-25'),
      ],
      responses: { 200: ok('Overview summary'), 400: error('INVALID_DATE_RANGE: invalid start_date/end_date, or start_date after end_date'), ...bearer403 },
    },
  },
  '/api/overview/events': {
    get: {
      tags: ['Overview'],
      summary: 'Overview Server-Sent Events stream',
      description: 'Requires permission: overview. Uses the same start_date/end_date filters as /api/overview. Push-only (no server polling). Sends an initial overview_snapshot, ping keepalives, and overview_updated events after transaction changes. Admin streams send session_revoked { reason } and close when the session is logged out, revoked, expired, or the user is disabled/deleted (reason: logout, refresh_token_reused, session_revoked, session_expired, session_idle_expired, session_not_found, user_disabled, user_deleted). Refreshing the access token does not require reopening the stream.',
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
