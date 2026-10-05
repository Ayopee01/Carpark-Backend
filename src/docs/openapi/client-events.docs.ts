// Import Docs
import { body, deviceAuth, error, idParam, ok, optionalDeviceRoute, publicRoute, query, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Client Events
const paths = {
  '/api/client/events': {
    get: {
      tags: ['Client Events'],
      summary: 'Shared client SSE event stream',
      description: 'Shared event stream for kiosk, barrier gate, and public/mobile clients. No admin Bearer token is required. If deviceId is supplied, valid device credentials are required and the device may be kiosk or barrier_gate. For kiosk/barrier clients, the open SSE connection refreshes the device heartbeat on each server ping so the device remains online while connected. LPR results are emitted as lpr_detected after POST /api/transactions is processed, only to authenticated kiosk/barrier gate streams (public/mobile streams receive theme_updated only). On each ping the device token is checked again; if the device was deleted or its activation code was reissued, the stream sends device_revoked { reason } and closes. Use gateId, direction, and optionally cameraId to subscribe a barrier-gate screen to only its mapped camera events. Barrier Gate screens open the barrier only when lpr_detected.openGate is true (action OPEN_GATE). success only means the event was processed without error. PAYMENT_REQUIRED means do not open and show or route to payment using remainingAmount/netAmount/totalPaid; IGNORE_ACTIVE_TRANSACTION (IN for a plate with an unpaid open transaction) and IGNORE_DUPLICATE have openGate false. Entry transactions use status pending. lpr_detected always includes checkedAt, and amount fields default to 0 when no payment is required. payment_settings_updated (no data) is sent to every client stream when Admin changes payment settings; reload GET /api/client/payments/methods. Current events include connected, ping, theme_updated, payment_settings_updated, lpr_detected, and device_revoked.',
      security: [...deviceAuth, {}],
      parameters: [
        query('deviceId', { type: 'string' }, 'BG-20260618-001'),
        query('gateId', { type: 'string' }, 'GATE-IN-A'),
        query('direction', { type: 'string', enum: ['IN', 'OUT'] }, 'IN'),
        query('cameraId', { type: 'string' }, 'CAM-OUT-A'),
      ],
      responses: { 200: { description: 'SSE stream' }, 400: error('Device identity mismatch'), 401: error('Unauthorized device'), 403: error('Device under maintenance or invalid device credentials') },
    },
  },
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
      summary: 'Lookup one payable transaction by plateNo',
      description: 'Public lookup for kiosk, barrier gate, and mobile users. Frontend sends at least 4 normalized plate characters as query param plateNo. If more than one full plate matches, the response is a candidate list containing full plateNo values for the user to choose and search again. Client lookup excludes completed, cancelled, and already-exited transactions from candidates. deviceId is optional. If deviceId is omitted, the source is treated as mobile_user. If deviceId is supplied, it must be an activated registered device. Kiosk/barrier gate requests that send deviceId must also send device credentials (X-Device-Id + X-Device-Token, or Authorization: Device <token>); deviceId alone is rejected with 401 or 403.',
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
        403: error('Already processed or device under maintenance'),
        404: error('Transaction not found'),
      },
    },
  },
  '/api/client/transactions/{id}': {
    get: {
      tags: ['Client Events'],
      summary: 'Get one transaction by transaction id',
      description: 'Used by the mobile QR payment page (qrData is /payment?tx=<transactionId>). Accepts the transaction id only; look up by plate number with GET /api/client/transactions?plateNo= (at least 4 characters). Completed or cancelled transactions return 403. Kiosk/barrier gate requests that send deviceId must also send device credentials.',
      security: optionalDeviceRoute,
      parameters: [idParam('id', 't_123'), query('deviceId', { type: 'string' }, 'K-20260521-008')],
      responses: {
        200: ok('Transaction', ref('Transaction')),
        401: error('Device credentials are required'),
        403: error('Already processed or device under maintenance'),
        404: error('Transaction not found'),
      },
    },
  },
  '/api/client/payments/test': {
    post: {
      tags: ['Dev Test'],
      summary: '[Dev Test] Receive client payment',
      description: 'Dev Test endpoint: records a payment without a real payment gateway so the parking flow can be tested end to end. Enabled only when ENABLE_PAYMENT_SIMULATION=true (the same switch as simulate-paid); otherwise returns 403 PAYMENT_SIMULATION_DISABLED. Always pays the full remaining amount calculated by the backend; body amount is ignored. Returns 400 NO_REMAINING_AMOUNT when nothing is left to pay. Barrier gate payments complete the transaction only when fully paid. Public payment endpoint for kiosk, barrier gate, and mobile users. deviceId is optional. If deviceId belongs to a barrier gate, channel is gate; if it belongs to a kiosk, channel is kiosk; otherwise channel is mobile. The selected/default method must be active and allowed by the resolved channel. Kiosk/barrier gate requests that send deviceId must also send device credentials (X-Device-Id + X-Device-Token, or Authorization: Device <token>); deviceId alone is rejected with 401 or 403.',
      security: optionalDeviceRoute,
      requestBody: body(ref('PaymentRequest'), { transactionId: 't_123', method: 'qr', deviceId: 'K-20260521-008' }),
      responses: { 200: ok('Payment received'), 400: error('transactionId or plateNo is required, invalid payment method/channel, NO_REMAINING_AMOUNT, or payment failed'), 401: error('Invalid or unregistered deviceId'), 403: error('PAYMENT_SIMULATION_DISABLED or device under maintenance') },
    },
  },
  '/api/client/payments/methods': {
    get: {
      tags: ['Client Events'],
      summary: 'List payment methods available for this client',
      description: 'Returns only methods that are active and allowed for the client channel, in allowedMethods order. card is included only for a kiosk/barrier gate whose bound EDC device is active (never for mobile), and edc { deviceId, deviceName, terminalId } describes that EDC (null otherwise). Kiosk/Barrier Gate send device credentials (channel kiosk or gate); without deviceId the channel is mobile. Call before showing payment options (for example before starting the EDC terminal) and again after payment_settings_updated on the client SSE.',
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
      description: 'Kiosk and Barrier Gate take cards only on the EDC terminal (tap card). Call this after the EDC terminal approved the payment. Requires device credentials of a kiosk or barrier_gate (X-Device-Id + X-Device-Token). Records method card with channel kiosk or gate (from the device), the charged amount (baht, required, > 0, not above the remaining amount: 400 AMOUNT_EXCEEDS_REMAINING), reference = EDC approval code (required), and terminalId = id of the EDC terminal reported by the terminal (required). terminalId must equal the terminalId of the EDC device Admin bound to this device (edcDeviceId): 403 EDC_TERMINAL_NOT_CONFIGURED when no EDC is bound, 403 EDC_TERMINAL_UNAVAILABLE when the EDC is not active, 403 EDC_TERMINAL_MISMATCH when the TID differs. The payment stores terminalId and edcDeviceId. A reference of a terminal can be used for one transaction only (409 PAYMENT_REFERENCE_USED). Sending the same reference again (retry after a network error) returns the saved transaction with duplicate: true and does not record twice. 400 NO_REMAINING_AMOUNT or AMOUNT_EXCEEDS_REMAINING after the EDC approved means the money was not recorded: void the payment on the EDC terminal. Barrier Gate payments complete the transaction when fully paid. Card must be active and allowed for the channel (400 PAYMENT_SELECTION_INVALID).',
      security: deviceAuth,
      requestBody: body({
        type: 'object',
        required: ['amount', 'reference', 'terminalId'],
        properties: {
          transactionId: { type: 'string', example: 't_123', description: 'Preferred. Or send plateNo (full plate, exact match).' },
          plateNo: { type: 'string', example: 'กข1234' },
          amount: { type: 'number', example: 40, description: 'Amount charged on the EDC terminal in baht.' },
          reference: { type: 'string', maxLength: 100, example: 'APPR-123456', description: 'EDC approval code / slip number.' },
          terminalId: { type: 'string', maxLength: 50, example: 'TID-12345678', description: 'EDC terminal id from the terminal result. Must match the terminalId of the bound EDC device.' },
        },
      }, { transactionId: 't_123', amount: 40, reference: 'APPR-123456', terminalId: 'TID-12345678' }),
      responses: {
        200: ok('Payment recorded, or already recorded for this reference (duplicate: true)'),
        400: error('VALIDATION_ERROR, PAYMENT_SELECTION_INVALID, AMOUNT_EXCEEDS_REMAINING, or NO_REMAINING_AMOUNT'),
        401: error('Device credentials are required'),
        403: error('Invalid device credentials, device under maintenance, EDC_TERMINAL_NOT_CONFIGURED, EDC_TERMINAL_UNAVAILABLE, or EDC_TERMINAL_MISMATCH'),
        404: error('Transaction not found or not payable'),
        409: error('PAYMENT_REFERENCE_USED'),
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
