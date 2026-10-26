// Import Docs
import { body, deviceAuth, error, idParam, ok, optionalDeviceRoute, publicRoute, query, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Client Events
const paths = {
  '/api/client/activate': {
    post: {
      tags: ['Client Events'],
      summary: 'Activate kiosk or barrier gate with activation code',
      description: 'Shared activation endpoint for kiosk and barrier gate frontends. The role is determined by the activation code created from POST /api/devices, so the client only needs to send the code. Cameras and printers are provisioned directly by admins through POST /api/devices with deviceType camera or printer.',
      security: publicRoute,
      requestBody: body(ref('ActivationRequest')),
      responses: { 200: ok('Activation successful', ref('ActivationResponse')), 400: error('Activation code is required, invalid, or expired') },
    },
  },
  '/api/client/transactions': {
    get: {
      tags: ['Client Events'],
      summary: 'Lookup one payable transaction by plateNo (kiosk/barrier gate only)',
      description: 'Kiosk and barrier gate only: requests without device headers (mobile) return 403 MOBILE_PLATE_LOOKUP_NOT_ALLOWED, because mobile reaches a transaction only through the QR on the ticket (GET /api/client/transactions/{id}); a customer who lost the ticket pays at a kiosk or barrier gate. Frontend sends at least 4 normalized plate characters as query param plateNo. If more than one full plate matches, the response is a candidate list containing full plateNo values for the user to choose and search again. Client lookup excludes completed, cancelled, and already-exited transactions from candidates. Kiosk/barrier gate requests must send device credentials (X-Device-Id + X-Device-Token, or Authorization: Device <token>); deviceId alone is rejected with 401 or 403.',
      security: optionalDeviceRoute,
      parameters: [
        query('plateNo', { type: 'string', minLength: 4 }, '9012', true),
        query('deviceId', { type: 'string' }, 'K-20260521-008'),
      ],
      responses: {
        200: ok('Transaction or plate candidates', {
          oneOf: [ref('Transaction'), ref('PlateLookupMultipleResponse')],
        }),
        400: error('plateNo is required or too short'),
        401: error('Invalid or unregistered deviceId'),
        403: error('MOBILE_PLATE_LOOKUP_NOT_ALLOWED (no device headers), already processed, or device under maintenance'),
        404: error('Transaction not found'),
      },
    },
  },
  '/api/client/transactions/{id}': {
    get: {
      tags: ['Client Events'],
      summary: 'Get one transaction by transaction id',
      description: 'Used by the mobile QR payment page (qrData is <frontendUrl>/payment?tx=<transactionId> and carries nothing else: no device id, token, or activation code). transactionId is the only key mobile has to a transaction, so it is random (t_ + UUID v4, 122 random bits), never a running number, billNo, timestamp, or plate-derived value; the same value is used in qrData, the transactionId field of the response, and the transactionId body field of POST /api/client/payments/charges. Plate number lookup (GET /api/client/transactions?plateNo=) is for kiosk/barrier gate only. Completed, cancelled, or already-exited transactions return 403 TRANSACTION_ALREADY_PROCESSED without transaction details. Requests without device headers are limited per IP to PUBLIC_CLIENT_RATE_LIMIT per minute across the client lookup/payment endpoints; over the limit returns 429 TOO_MANY_REQUESTS with Retry-After (seconds). Kiosk/barrier gate requests that send deviceId must also send device credentials. Mobile (no device headers) may use only GET /api/client/config, GET /api/client/payments/methods, GET /api/client/transactions/{id}, POST /api/client/payments/charges (with transactionId), GET /api/client/payments/charges/{chargeId}/qr, and the Socket.IO /client namespace without auth (theme:updated, payment_settings:updated, and payments:subscribe with chargeId only).',
      security: optionalDeviceRoute,
      parameters: [idParam('id', 't_123'), query('deviceId', { type: 'string' }, 'K-20260521-008')],
      responses: {
        200: ok('Transaction', ref('Transaction')),
        401: error('Device credentials are required'),
        403: error('TRANSACTION_ALREADY_PROCESSED or device under maintenance'),
        404: error('Transaction not found'),
        429: error('TOO_MANY_REQUESTS (mobile, per IP) with Retry-After'),
      },
    },
  },
  '/api/client/payments/methods': {
    get: {
      tags: ['Client Events'],
      summary: 'List payment methods available for this client',
      description: 'Returns only methods that are active and allowed for the client channel, in allowedMethods order. card is included only for a kiosk/barrier gate whose bound EDC device is active (never for mobile), and edc { deviceId, deviceName, terminalId } describes that EDC (null otherwise). Kiosk/Barrier Gate send device credentials (channel kiosk or gate); without deviceId the channel is mobile. Call before showing payment options (for example before starting the EDC terminal) and again after payment_settings:updated on the Socket.IO /client namespace.',
      security: optionalDeviceRoute,
      parameters: [query('deviceId', { type: 'string' }, 'K-20260521-008')],
      responses: {
        200: ok('Available payment methods', {
          type: 'object',
          properties: {
            channel: { type: 'string', example: 'kiosk' },
            edc: { type: 'object', nullable: true, properties: { deviceId: { type: 'string', example: 'EDC-20261001-001' }, deviceName: { type: 'string' }, terminalId: { type: 'string', example: 'TID-12345678' } } },
            methods: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', example: 'promptpay' }, label: { type: 'string', example: 'PromptPay' }, icon: { type: 'string', nullable: true, example: 'qr' } } } },
          },
        }),
        401: error('Device credentials are required'),
        403: error('Device under maintenance'),
      },
    },
  },
  '/api/client/payments/edc': {
    post: {
      tags: ['Client Events'],
      summary: 'Record a card payment taken on the Kiosk/Barrier Gate EDC terminal',
      description: 'Kiosk and Barrier Gate take cards only on the EDC terminal (tap card). Call this after the EDC terminal approved the payment. Requires device credentials of a kiosk or barrier_gate (X-Device-Id + X-Device-Token). Records method card with channel kiosk or gate (from the device), the charged amount (baht, required, > 0, not above the remaining amount: 400 AMOUNT_EXCEEDS_REMAINING), reference = EDC approval code (required), and terminalId = id of the EDC terminal reported by the terminal (required). terminalId must equal the terminalId of the EDC device Admin bound to this device (edcDeviceId): 403 EDC_TERMINAL_NOT_CONFIGURED when no EDC is bound, 403 EDC_TERMINAL_UNAVAILABLE when the EDC is not active, 403 EDC_TERMINAL_MISMATCH when the TID differs. The payment stores terminalId, edcDeviceId, and edcVerification. Before recording, the approval code is checked with the card provider of the bound EDC (provider field) when a verifier for that provider exists: 402 EDC_APPROVAL_REJECTED { reason } means the provider has no such approval and nothing was recorded. Without a verifier (current state) the payment is stored with edcVerification unverified and must be matched with the EDC settlement through edcReconciliation of GET /api/overview. A reference of a terminal can be used for one transaction only (409 PAYMENT_REFERENCE_USED). Sending the same reference again (retry after a network error) returns the saved transaction with duplicate: true and does not record twice. While the transaction has a PromptPay QR that can still be paid (PromptPay cannot be cancelled through Omise), returns 409 PENDING_GATEWAY_CHARGE with chargeId, method, channel, amount (satang), and expiresAt and records nothing; unlike Admin there is no confirmPendingCharge, so do not start the EDC terminal while a QR is open (pay that QR or wait until expiresAt). A retry of a reference that is already recorded still returns the saved payment. 400 NO_REMAINING_AMOUNT, AMOUNT_EXCEEDS_REMAINING, or 409 PENDING_GATEWAY_CHARGE after the EDC approved means the money was not recorded: void the payment on the EDC terminal. Barrier Gate payments complete the transaction when fully paid. Card must be active and allowed for the channel (400 PAYMENT_SELECTION_INVALID).',
      security: deviceAuth,
      requestBody: body(ref('ClientEdcPaymentRequest'), { transactionId: 't_123', amount: 40, reference: 'APPR-123456', terminalId: 'TID-12345678' }),
      responses: {
        200: ok('Payment recorded, or already recorded for this reference (duplicate: true)'),
        400: error('VALIDATION_ERROR, PAYMENT_SELECTION_INVALID, AMOUNT_EXCEEDS_REMAINING, or NO_REMAINING_AMOUNT'),
        401: error('Device credentials are required'),
        402: error('EDC_APPROVAL_REJECTED'),
        403: error('Invalid device credentials, device under maintenance, EDC_TERMINAL_NOT_CONFIGURED, EDC_TERMINAL_UNAVAILABLE, or EDC_TERMINAL_MISMATCH'),
        404: error('Transaction not found or not payable'),
        409: error('PAYMENT_REFERENCE_USED, or PENDING_GATEWAY_CHARGE (a PromptPay QR of the transaction can still be paid)'),
      },
    },
  },
  '/api/client/heartbeat': {
    post: {
      tags: ['Client Events'],
      summary: 'Shared kiosk/barrier gate heartbeat',
      description: 'Shared heartbeat endpoint for credentialed kiosk, barrier gate, camera, and printer devices. Use X-Device-Id and X-Device-Token. The backend detects the device type from the device record.',
      security: deviceAuth,
      requestBody: body(ref('CheckInRequest')),
      responses: { 200: ok('Check-in successful'), 400: error('deviceId is required'), 401: error('Invalid or unregistered deviceId'), 403: error('Device under maintenance') },
    },
  },
};

export default paths;
