// Import Docs
import { bearer403, body, error, idParam, ok, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Payment Settings
const paths = {
  '/api/payment-settings/methods': {
    get: {
      tags: ['Payment Settings'],
      summary: 'List payment methods with meta',
      description: 'Requires permission: pricing. Method id is a stable key (cash, qr, promptpay, card, mobile_banking, bank1, wallet, other) and is the exact value sent as method when paying; it cannot be renamed. label and icon are display only. Admin scan-to-pay (Omise QR) uses promptpay; qr is a method without a payment gateway.',
      responses: { 200: ok('Payment methods'), ...bearer403 },
    },
  },
  '/api/payment-settings/methods/{id}': {
    patch: {
      tags: ['Payment Settings'],
      summary: 'Update payment method',
      description: 'Requires permission: pricing. This setting is managed by authorized admin users.',
      parameters: [idParam('id', 'cash')],
      requestBody: body(ref('PaymentMethodUpdateRequest'), { isActive: true }),
      responses: { 200: ok('Payment method updated', ref('SuccessMessageResponse')), 401: error('Missing, invalid, expired, or revoked access token'), 403: error('Authenticated user does not have the required permission'), 404: error('Method not found') },
    },
  },
  '/api/payment-settings/channels': {
    get: {
      tags: ['Payment Settings'],
      summary: 'List service channels with meta',
      description: 'Requires permission: pricing. Each channel has a stable id (ch_cashier, ch_kiosk, ch_mobile, ch_gate) and code (cashier, kiosk, mobile, gate); code is the value sent as channel when paying. allowedMethods holds method ids. A payment or Omise charge with an inactive method, or a method missing from the channel allowedMethods, returns 400 PAYMENT_SELECTION_INVALID.',
      responses: { 200: ok('Service channels'), ...bearer403 },
    },
  },
  '/api/payment-settings/channels/{id}': {
    patch: {
      tags: ['Payment Settings'],
      summary: 'Update allowed payment methods for a channel',
      description: 'Requires permission: pricing. This setting is managed by authorized admin users.',
      parameters: [idParam('id', 'ch_kiosk')],
      requestBody: body(ref('ChannelMappingUpdateRequest'), { allowedMethods: ['qr', 'wallet'] }),
      responses: { 200: ok('Channel mapping updated', ref('SuccessMessageResponse')), 401: error('Missing, invalid, expired, or revoked access token'), 403: error('Authenticated user does not have the required permission'), 404: error('Channel not found or invalid methods') },
    },
  },
};

export default paths;
