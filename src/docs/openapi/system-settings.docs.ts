// Import Docs
import { bearer403, body, configWriteResponses, ok, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag System Settings
const paths = {
  '/api/system-settings': {
    get: {
      tags: ['System Settings'],
      summary: 'Get system settings with meta',
      description: 'Requires permission: settings.',
      responses: { 200: ok('System settings'), ...bearer403 },
    },
    put: {
      tags: ['System Settings'],
      summary: 'Update system settings',
      description: 'Requires permission: settings. Fields are merged into the current values of each group (general, receipt including entryBill/paymentBill/printer, billing); fields not sent keep their current value. receipt.paymentBill.expiryDuration is the exit window in minutes and must be an integer between 1 and 1440.',
      requestBody: body({ type: 'object', additionalProperties: true }, { general: { systemName: 'Smart Carpark' } }),
      responses: { 200: ok('System settings updated', ref('SuccessMessageResponse')), ...configWriteResponses },
    },
  },
};

export default paths;
