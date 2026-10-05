// Import Docs
import { bearer, bearer403, body, error, idParam, ok, query, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Payments
const paths = {
  '/api/payments/charges': {
    post: {
      tags: ['Payments'],
      summary: 'Create Omise charge for Admin payment',
      description: 'Source-based charges only (PromptPay QR). For PromptPay the frontend may omit source and send method promptpay; the backend creates the PromptPay source with the secret key (Omise.js not needed). Admin card payments are taken on the EDC terminal, so a card token returns 400 ADMIN_CARD_NOT_SUPPORTED. Checks payment settings before calling Omise: method (for example promptpay) must be active and in ch_cashier allowedMethods, otherwise 400 PAYMENT_SELECTION_INVALID and no charge is created. If the transaction already has a pending charge with the same method, channel, and amount (and the QR is not about to expire), the existing charge is returned with reused: true instead of creating a second QR, so the customer cannot pay twice. Admin PromptPay/QR payment endpoint. Requires Bearer auth and transactions permission. This endpoint always stores gateway charges with channel cashier so Admin QR is counted under cashier, while scan revenue still comes from method promptpay/qr. Realtime updates are sent over WebSocket at /api/payments/ws?chargeId={chargeId}&ticket={ticket} with a single-use ticket from POST /api/payments/ws-ticket (browsers), or with Authorization: Bearer for non-browser clients (?token={accessToken} is still accepted but will be removed); the user must have transactions permission. A failed check completes the upgrade and then closes the socket with a close code browsers can read: 4401 (reason invalid_token = refresh the access token and reconnect once; other reasons such as logout, session_revoked, session_expired, session_idle_expired, user_disabled = log in again) or 4403 (reason forbidden). An open admin socket is closed the same way when its session ends or the transactions permission is removed (checked on session_revoked events and every ping interval); an access token that only expired does not close it. 1011 internal_error means a server error, so reconnect with backoff. returnUri, when sent, must be an http or https URL. PromptPay needs a remaining amount of at least 20 THB (Omise minimum); below it the backend returns 400 AMOUNT_BELOW_GATEWAY_MINIMUM with minimumAmount and remainingAmount (THB) without calling Omise. Do not use the public client charge endpoint (POST /api/client/payments/charges) for Admin payments.',
      security: bearer,
      requestBody: body(ref('AdminOmiseChargeRequest'), {
        transactionId: 't_123',
        method: 'promptpay',
        channel: 'cashier',
        amount: 4000,
      }),
      responses: {
        201: ok('Admin Omise charge created (or the pending charge reused, see charge.reused)', ref('OmiseChargeResponse')),
        400: error('transactionId/plateNo, source/token, channel, or amount is invalid, or AMOUNT_BELOW_GATEWAY_MINIMUM'),
        404: error('Transaction not found'),
        409: error('Multiple plate matches require user selection'),
        ...bearer403,
      },
    },
  },
  '/api/payments/edc/reconciliation': {
    get: {
      tags: ['Payments'],
      summary: 'EDC card payment reconciliation report',
      description: 'Requires permission: transactions. Lists card payments (EDC) paid in the range, grouped by terminalId, to compare with the EDC settlement report of each terminal. Send date (YYYY-MM-DD, Bangkok day) or start_date/end_date (max 31 days); default today. Response: range, total { count, amount }, missingReferenceCount (card payments without reference, check manually), terminals [{ terminalId, edcDevice { deviceId, deviceName, location, provider, usage } | null, channels, deviceIds, count, amount, payments [{ transactionId, plateNo, billNo, paymentId, reference, terminalId, edcDeviceId, amount, paidAt, channel, deviceId, processedBy }] }]. Amounts are in baht.',
      security: bearer,
      parameters: [
        query('date', { type: 'string', format: 'date' }, '2026-10-01'),
        query('start_date', { type: 'string', format: 'date' }, '2026-10-01'),
        query('end_date', { type: 'string', format: 'date' }, '2026-10-07'),
      ],
      responses: { 200: ok('EDC reconciliation report'), 400: error('INVALID_DATE_RANGE'), ...bearer403 },
    },
  },
  '/api/payments/edc/terminals': {
    get: {
      tags: ['Payments'],
      summary: 'List cashier EDC terminals',
      description: 'Requires permission: transactions. Active EDC devices with usage cashier, for staff to choose the counter EDC before taking cards. Response: { data: [{ deviceId, deviceName, terminalId, location, provider }] }. Send the chosen deviceId as edcDeviceId in POST /api/transactions/{plateNo}/payment.',
      security: bearer,
      responses: { 200: ok('Cashier EDC terminals'), ...bearer403 },
    },
  },
  '/api/payments/methods': {
    get: {
      tags: ['Payments'],
      summary: 'List payment methods available for Admin (cashier)',
      description: 'Requires permission: transactions (no pricing permission needed). Returns only methods that are active and allowed in ch_cashier, in allowedMethods order, so the Admin payment screen shows only methods that can be recorded. card is included only when at least one active cashier EDC exists.',
      security: bearer,
      responses: { 200: ok('Available payment methods', {
          type: 'object',
          properties: {
            channel: { type: 'string', example: 'kiosk' },
            methods: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', example: 'promptpay' }, label: { type: 'string', example: 'PromptPay' }, icon: { type: 'string', nullable: true, example: 'qr' } } } },
          },
        }), ...bearer403 },
    },
  },
  '/api/payments/refunds': {
    get: {
      tags: ['Payments'],
      summary: 'List Omise payments that must be refunded',
      description: 'Requires permission: transactions. Lists successful Omise charges whose money could not be applied or was more than the parking fee. refundReason: already_paid (transaction was fully paid before the webhook, e.g. a second QR), transaction_not_payable (completed/cancelled/exited), transaction_not_found, overpaid (only refundAmount was above the fee). refundAmount is in minor units (satang). These amounts are not counted as revenue except overpaid, where the full charge was recorded on the transaction. PromptPay cannot be refunded through Omise, so refund the customer manually (cash or bank transfer), then call resolve.',
      security: bearer,
      parameters: [query('status', { type: 'string', enum: ['pending', 'resolved'] }, 'pending')],
      responses: {
        200: ok('Refund list', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            summary: { type: 'object', properties: { pendingCount: { type: 'integer', example: 1 }, pendingAmount: { type: 'integer', example: 4000 } } },
          },
        }),
        ...bearer403,
      },
    },
  },
  '/api/payments/refunds/events': {
    get: {
      tags: ['Payments'],
      summary: 'Admin refund Server-Sent Events stream',
      description: 'Requires permission: transactions. Open once in the Admin layout to alert every page when money must be refunded. Push-only (no polling). Sends connected, refunds_snapshot { pendingCount, pendingAmount, data: [refund item] } on every (re)connect, refund_required when a successful Omise charge could not be applied or was more than the fee, refund_resolved when an admin resolves a refund, ping, and session_revoked { reason } before closing when the session ends. Refund item fields: chargeId, transactionId, plateNo, method, channel, amount, refundAmount, refundReason, paidAt, refundMethod (null until resolved). refund_required adds applied (false = whole charge must be refunded, true with refundReason overpaid = only refundAmount). refund_resolved has chargeId, transactionId, plateNo, resolvedBy (user id), refundNote, refundResolvedAt, refundMethod (manual = staff refunded the customer themselves), refundId (always null for manual refunds). Every event carries pendingCount and pendingAmount after the event, and at. The stream also sends payment_settings_updated (no data) when payment settings change; reload GET /api/payments/methods. All money fields are in satang. refund_required is emitted once per charge (webhook retries do not repeat it); events that happen while disconnected are not replayed, so compare refunds_snapshot.data with the chargeIds already shown. The raw Omise charge is never included.',
      security: bearer,
      responses: { 200: { description: 'SSE stream' }, ...bearer403 },
    },
  },
  '/api/payments/charges/{chargeId}/verify': {
    post: {
      tags: ['Payments'],
      summary: 'Check an Omise charge status with Omise',
      description: 'Requires permission: transactions. Manual fallback for a charge stuck in pending (for example when the Omise webhook did not arrive); do not call it on a timer. Reads the live charge from Omise. If it is paid, records the payment once (same path as the webhook) and emits payment_updated on the payment WebSocket, so screens can rely on the WebSocket only. failed/expired/reversed are saved and emitted too; a pending charge returns action pending without an event. Rate limit: 1 call per charge every 10 seconds (429 CHARGE_VERIFY_TOO_FREQUENT with Retry-After).',
      security: bearer,
      parameters: [{ name: 'chargeId', in: 'path', required: true, schema: { type: 'string' }, example: 'chrg_test_123' }],
      responses: {
        200: ok('Charge verified', { type: 'object', properties: { message: { type: 'string' }, action: { type: 'string', enum: ['processed', 'refund_required', 'already_processed', 'pending', 'updated'] }, chargeId: { type: 'string' }, status: { type: 'string' }, refundAmount: { type: 'integer' }, refundReason: { type: 'string' }, transaction: ref('AnyObject') } }, { message: 'Charge verified', action: 'pending', chargeId: 'chrg_test_123', status: 'pending' }),
        400: error('NOT_OMISE_CHARGE'),
        404: error('GATEWAY_CHARGE_NOT_FOUND'),
        429: error('CHARGE_VERIFY_TOO_FREQUENT'),
        504: error('OMISE_TIMEOUT'),
        ...bearer403,
      },
    },
  },
  '/api/payments/ws-ticket': {
    post: {
      tags: ['Payments'],
      summary: 'Issue a single-use ticket for the Admin payment WebSocket',
      description: 'Requires permission: transactions. Returns a ticket bound to the caller user, session, and chargeId that expires in 30 seconds and works once. Browsers connect with WS /api/payments/ws?chargeId={chargeId}&ticket={ticket} so the access token never appears in the URL; request a new ticket for every connect and reconnect. A wrong, used, expired, or other-charge ticket closes the socket with 4401 invalid_token; an ended session closes it with 4401 and the session reason; a missing permission closes it with 4403 forbidden. A ticket connection can subscribe only to its chargeId. Tickets live in API memory, so an API restart drops unused tickets. Rate limit: 30 requests per user per minute (429 TOO_MANY_REQUESTS with Retry-After).',
      security: bearer,
      requestBody: body({ type: 'object', required: ['chargeId'], properties: { chargeId: { type: 'string', maxLength: 100 } } }, { chargeId: 'chrg_test_123' }),
      responses: {
        200: ok('Ticket issued', { type: 'object', properties: { ticket: { type: 'string' }, expiresIn: { type: 'integer', example: 30 } } }, { ticket: 'Q2hhcmdlVGlja2V0RXhhbXBsZQ', expiresIn: 30 }),
        400: error('VALIDATION_ERROR (chargeId)'),
        404: error('GATEWAY_CHARGE_NOT_FOUND'),
        429: error('TOO_MANY_REQUESTS'),
        ...bearer403,
      },
    },
  },
  '/api/payments/refunds/{chargeId}/resolve': {
    post: {
      tags: ['Payments'],
      summary: 'Mark an Omise refund as done',
      description: 'Requires permission: transactions. Records that the customer was refunded manually (PromptPay cannot be refunded through Omise). Stores the admin user id and optional note, then emits refund_resolved on /api/payments/refunds/events. Concurrent resolves of the same charge succeed once; the others return 409 REFUND_ALREADY_RESOLVED.',
      security: bearer,
      parameters: [{ name: 'chargeId', in: 'path', required: true, schema: { type: 'string' }, example: 'chrg_test_123' }],
      requestBody: body({ type: 'object', properties: { note: { type: 'string', nullable: true } } }, { note: 'Refunded by bank transfer' }, false),
      responses: {
        200: ok('Refund resolved'),
        400: error('REFUND_NOT_REQUIRED'),
        404: error('GATEWAY_CHARGE_NOT_FOUND'),
        409: error('REFUND_ALREADY_RESOLVED'),
        ...bearer403,
      },
    },
  },
  '/api/payments/charges/{chargeId}/qr': {
    get: {
      tags: ['Payments'],
      summary: 'Proxy Admin Omise PromptPay QR image',
      description: 'Admin helper endpoint for displaying PromptPay QR images. Requires Bearer auth and transactions permission. Uses the saved Omise charge in the path (optional documentPath query downloads that Omise document instead) and does not apply mobile/kiosk/gate client source logic.',
      security: bearer,
      parameters: [
        idParam('chargeId', 'chrg_test_123'),
        query('documentPath', { type: 'string' }, '/charges/chrg_test_123/documents/docu_test_123'),
      ],
      responses: {
        200: {
          description: 'QR image binary',
          content: {
            'image/png': { schema: { type: 'string', format: 'binary' } },
            'image/jpeg': { schema: { type: 'string', format: 'binary' } },
            'image/svg+xml': { schema: { type: 'string', format: 'binary' } },
          },
        },
        400: error('Invalid chargeId or documentPath'),
        404: error('Gateway charge not found'),
        502: error('Unable to load Omise QR image'),
        ...bearer403,
      },
    },
  },
};

export default paths;
