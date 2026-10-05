// Import Docs
import { bearer, bearer403, body, deviceAuth, error, idParam, ok, query, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Transactions
const paths = {
  '/api/transactions': {
    get: {
      tags: ['Transactions'],
      summary: 'List transactions by page',
      description: 'Admin flow. Requires Bearer token and transactions permission. Backend supports page=?&per_page=?; frontend controls the page/per_page values. Example: /api/transactions?page=1&per_page=10, then /api/transactions?page=2&per_page=10.',
      parameters: [
        query('keyword', { type: 'string' }, '3งจ9012'),
        query('plate_no', { type: 'string' }, '3งจ9012'),
        query('bill_no', { type: 'string' }, 'PK20260524-120000'),
        query('page', { type: 'integer', default: 1 }, 1),
        query('per_page', { type: 'integer', default: 10, maximum: 100 }, 10),
        query('all', { type: 'string', enum: ['true', '1', 'false', '0'] }, 'false'),
      ],
      responses: { 200: ok('Transactions list'), ...bearer403 },
    },
    post: {
      tags: ['Transactions'],
      summary: 'Create or update transaction from camera/LPR body',
      description: 'Admin/camera integration flow. Admins may use Bearer token with transactions permission; provisioned cameras may use x-device-id and x-device-token. cameraId must match the authenticated camera device when device credentials are used. gateId is optional; if omitted, backend resolves it from cameraId and direction through the barrier gate mapping. Events of the same plate are processed one at a time (database lock), so concurrent IN events cannot create two open transactions. capturedAt without a timezone is read as Bangkok time; a capturedAt more than 5 minutes ahead of the server is replaced with the server time. IN events create pending transactions when the plate has no open transaction. Repeated IN events for a plate with a pending or partially paid transaction return IGNORE_ACTIVE_TRANSACTION without creating another record. An IN event for a plate whose open transaction is already fully paid (paid_waiting_exit, the OUT event was missed) completes that transaction with closedReason missed_exit_event and creates a new one. OUT events return PAYMENT_REQUIRED when the calculated remainingAmount (including the fee added after exitTimeLimit) is greater than 0. When nothing is left to pay (free parking, or exitTimeLimit passed but the fee did not increase) OUT opens the gate and completes the transaction, storing netAmount at close time. Duplicate camera events within 10 seconds return IGNORE_DUPLICATE. Every response has success (the event was processed without error, not a gate decision) and openGate (true only for action OPEN_GATE). IGNORE_DUPLICATE and IGNORE_ACTIVE_TRANSACTION return success true with openGate false: the first event already decided the gate, and a plate with an unpaid open transaction must be checked by staff. Gate screens must open the barrier only when openGate is true.',
      security: [...deviceAuth, ...bearer],
      requestBody: body(ref('CameraTransactionRequest')),
      responses: { 200: ok('Duplicate, active transaction, or OUT event processed'), 201: ok('Transaction created'), 400: error('Validation error'), ...bearer403 },
    },
  },
  '/api/transactions/events': {
    get: {
      tags: ['Transactions'],
      summary: 'Transactions Server-Sent Events stream',
      description: 'Admin flow. Requires Bearer token and transactions permission. Uses the same keyword, plate_no, bill_no, page, per_page, and all query params as GET /api/transactions. Push-only (no server polling). Sends connected, transactions_snapshot, transactions_updated after transaction/payment changes, transactions_error on stream refresh failures, and ping. Admin streams send session_revoked { reason } and close when the session is logged out, revoked, expired, or the user is disabled/deleted. Refreshing the access token does not require reopening the stream.',
      parameters: [
        query('keyword', { type: 'string' }, '3งจ9012'),
        query('plate_no', { type: 'string' }, '3งจ9012'),
        query('bill_no', { type: 'string' }, 'PK20260524-120000'),
        query('page', { type: 'integer', default: 1 }, 1),
        query('per_page', { type: 'integer', default: 10, maximum: 100 }, 10),
        query('all', { type: 'string', enum: ['true', '1', 'false', '0'] }, 'false'),
      ],
      responses: {
        200: { description: 'SSE stream' },
        ...bearer403,
      },
    },
  },
  '/api/transactions/{plateNo}': {
    get: {
      tags: ['Transactions'],
      summary: 'Lookup transaction by plateNo',
      description: 'Admin flow. Requires Bearer token and transactions permission. The path value is a full or partial plateNo with at least 4 normalized characters. If more than one full plate matches, the response is a candidate list so the frontend can let the admin choose a full plate and call this endpoint again. Without exact, a value that matches no plate exactly but is contained in one other plate returns that other transaction. With exact=true only the same normalized plate is returned (404 TRANSACTION_NOT_FOUND otherwise, never a candidate list); use it before taking a payment. Admin lookup includes completed and cancelled transactions.',
      parameters: [idParam('plateNo', '1234'), query('exact', { type: 'string', enum: ['true', '1'] }, 'true')],
      responses: {
        200: ok('Transaction or plate candidates', {
          oneOf: [ref('Transaction'), ref('PlateLookupMultipleResponse')],
        }),
        400: error('plateNo is required or too short'),
        404: error('Not found'),
        ...bearer403,
      },
    },
    patch: {
      tags: ['Transactions'],
      summary: 'Update transaction fields by plateNo',
      description: 'Admin flow. Requires Bearer token and transactions permission. The path value is the full plateNo (exact match). Body is validated (400 VALIDATION_ERROR); unknown fields are ignored. A completed or cancelled transaction cannot change status (409 INVALID_STATUS_TRANSITION). Changing plateNo to a plate that already has an open transaction returns 409 ACTIVE_TRANSACTION_EXISTS. Setting status completed sets exitAt to now when missing and stores netAmount at close time.',
      parameters: [idParam('plateNo', '3งจ9012')],
      requestBody: body(ref('TransactionUpdateRequest')),
      responses: { 200: ok('Transaction updated'), 400: error('Validation error'), 404: error('Not found'), 409: error('INVALID_STATUS_TRANSITION or ACTIVE_TRANSACTION_EXISTS'), ...bearer403 },
    },
    delete: {
      tags: ['Transactions'],
      summary: 'Delete transaction by plateNo',
      description: 'Admin flow. Requires Bearer token and transactions permission. The path value is the full plateNo (exact match). Transactions that already have payments cannot be deleted (409 TRANSACTION_HAS_PAYMENTS); set status cancelled instead.',
      parameters: [idParam('plateNo', '3งจ9012')],
      responses: { 200: ok('Transaction deleted'), 404: error('Not found'), 409: error('TRANSACTION_HAS_PAYMENTS'), ...bearer403 },
    },
  },
  '/api/transactions/{plateNo}/payment': {
    post: {
      tags: ['Transactions'],
      summary: 'Confirm payment by plateNo',
      description: 'Admin payment flow. Requires Bearer token and transactions permission. The path value is the full plateNo (exact match). Admin payments are always recorded as channel cashier; channel may be omitted or cashier, any other value returns 400 ADMIN_CHANNEL_MUST_BE_CASHIER. method must be active and allowed by ch_cashier in payment settings. amount must be a number or numeric string greater than 0 (400 INVALID_AMOUNT). Card payments are taken on the EDC terminal; send method card with reference (EDC approval code) and edcDeviceId (cashier EDC chosen from GET /api/payments/edc/terminals); missing values return 400 PAYMENT_REFERENCE_REQUIRED / EDC_DEVICE_REQUIRED, a wrong EDC returns 400 EDC_DEVICE_NOT_FOUND / EDC_DEVICE_NOT_CASHIER or 409 EDC_DEVICE_UNAVAILABLE. The same reference sent again for the same transaction returns the saved payment; a reference already used by another transaction returns 409 PAYMENT_REFERENCE_USED. Returns 400 NO_REMAINING_AMOUNT when nothing is left to pay. If the transaction has an Omise QR that is still payable (PromptPay cannot be cancelled or refunded through Omise), returns 409 PENDING_GATEWAY_CHARGE with chargeId, method, channel, amount (satang), and expiresAt; send the same request again with confirmPendingCharge: true to take the payment anyway. Money from that QR, if paid later, goes to the Admin refund list.',
      parameters: [idParam('plateNo', '3งจ9012')],
      requestBody: body(ref('PaymentRequest'), {
        method: 'cash',
        channel: 'cashier',
        amount: 40,
      }),
      responses: {
        200: ok('Payment confirmed successfully', ref('AdminPaymentResponse')),
        400: error('Invalid payment method, ADMIN_CHANNEL_MUST_BE_CASHIER, INVALID_AMOUNT, PAYMENT_REFERENCE_REQUIRED, AMOUNT_EXCEEDS_REMAINING, or NO_REMAINING_AMOUNT'),
        404: error('Transaction not found'),
        409: error('PENDING_GATEWAY_CHARGE (an Omise QR for this transaction is still payable) or PAYMENT_REFERENCE_USED'),
        ...bearer403,
      },
    },

  },

};

export default paths;
