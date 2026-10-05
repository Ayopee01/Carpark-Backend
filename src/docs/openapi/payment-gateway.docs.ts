// Import Docs
import { body, error, idParam, ok, optionalDeviceRoute, publicRoute, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Payment Gateway
const paths = {
  '/api/client/payments/charges': {
    post: {
      tags: ['Payment Gateway'],
      summary: 'Create Omise charge for client payment',
      description: 'Source-based charges only (PromptPay QR). For PromptPay the frontend may omit source and send method promptpay; the backend creates the PromptPay source with the secret key (Omise.js not needed). Cards are taken on the EDC terminal (POST /api/client/payments/edc), so a card token returns 400 CARD_TOKEN_NOT_SUPPORTED. Checks payment settings before calling Omise: method must be active and allowed for the client channel (mobile, kiosk, or gate), otherwise 400 PAYMENT_SELECTION_INVALID and no charge is created. If the transaction already has a pending charge with the same method, channel, and amount (and the QR is not about to expire), the existing charge is returned with reused: true instead of creating a second QR, so the customer cannot pay twice. Public client payment gateway endpoint: send plateNo and method promptpay. Backend calculates the current remaining amount, creates an Omise charge with OMISE_SECRET_KEY, stores a pending gateway charge, and waits for Omise webhook before calling processPayment(). Payment success keeps the transaction paid_waiting_exit until a later OUT event completes the exit flow. returnUri, when sent, must be an http or https URL (400 INVALID_RETURN_URI). PromptPay needs a remaining amount of at least 20 THB (Omise minimum); below it the backend returns 400 AMOUNT_BELOW_GATEWAY_MINIMUM with minimumAmount and remainingAmount (THB) without calling Omise. Realtime updates are sent over WebSocket at /api/client/payments/ws?plateNo={plateNo} or ?chargeId={chargeId}; gatewayCharge in payment_updated does not include the raw Omise charge. Kiosk/barrier gate requests that send deviceId must also send device credentials (X-Device-Id + X-Device-Token, or Authorization: Device <token>); deviceId alone is rejected with 401 or 403.',
      security: optionalDeviceRoute,
      requestBody: body(ref('OmiseChargeRequest'), {
        plateNo: '3งจ9012',
        method: 'promptpay',
      }),
      responses: {
        201: ok('Omise charge created', ref('OmiseChargeResponse')),
        400: error('plateNo, source/token, or amount is invalid, or AMOUNT_BELOW_GATEWAY_MINIMUM'),
        401: error('Invalid or unregistered deviceId'),
        403: error('Device under maintenance'),
        404: error('Transaction not found'),
        409: error('Multiple plate matches require user selection'),
      },
    },
  },
  '/api/client/payments/charges/{chargeId}/qr': {
    get: {
      tags: ['Payment Gateway'],
      summary: 'Proxy Omise PromptPay QR image',
      description: 'Public Kiosk/mobile helper endpoint for displaying PromptPay QR images. Takes the chargeId in the path and returns the QR only while the saved gateway charge is still pending (400 QR_NOT_PAYABLE otherwise). The backend uses OMISE_SECRET_KEY to download the QR document from Omise. documentPath is available only on the Admin endpoint.',
      security: publicRoute,
      parameters: [
        idParam('chargeId', 'chrg_test_123'),
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
        400: error('The charge is no longer pending (QR_NOT_PAYABLE)'),
        404: error('Gateway charge not found'),
        502: error('Unable to load Omise QR image'),
      },
    },
  },
  '/api/payment-gateway/omise/webhook': {
    post: {
      tags: ['Payment Gateway'],
      summary: 'Receive Omise webhook',
      description: 'Public callback used by Omise. Backend verifies the Omise webhook signature (OMISE_WEBHOOK_SECRET is required in production when OMISE_SECRET_KEY is set), retrieves the charge from Omise, and only calls processPayment() after a successful charge. The charge is claimed and the payment recorded in one database transaction, so duplicate or concurrent deliveries apply the money once. Events of other Omise objects (for example refund.create) return action: ignored with 200. If the local gateway charge row is missing, it is recreated from the Omise charge metadata before processing.',
      security: publicRoute,
      responses: {
        200: ok('Webhook received', ref('OmiseWebhookResponse')),
        400: error('Invalid webhook payload'),
        401: error('Invalid Omise webhook signature'),
      },
    },
  },
  '/api/payment-gateway/omise/simulate-paid': {
    post: {
      tags: ['Payment Gateway'],
      summary: 'Simulate successful Omise payment for testing',
      description: 'Test/UAT helper for Postman. Requires ENABLE_PAYMENT_SIMULATION=true. If PAYMENT_SIMULATION_TOKEN is configured, send it as x-simulation-token or simulationToken in the body. This endpoint does not call Omise; it marks the saved gateway charge successful, processes the payment, and emits payment_updated for the websocket client.',
      security: publicRoute,
      parameters: [
        {
          name: 'x-simulation-token',
          in: 'header',
          required: false,
          schema: { type: 'string' },
          example: 'uat-secret',
        },
      ],
      requestBody: body({
        type: 'object',
        required: ['chargeId'],
        properties: {
          chargeId: { type: 'string', example: 'chrg_test_123' },
          simulationToken: { type: 'string', example: 'uat-secret' },
        },
      }),
      responses: {
        200: ok('Payment simulated'),
        400: error('chargeId is required or payment processing failed'),
        401: error('Invalid payment simulation token'),
        403: error('Payment simulation is disabled'),
        404: error('Gateway charge not found'),
      },
    },
  },
};

export default paths;
