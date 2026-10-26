// Import Docs
import { bearer403, body, configWriteResponses, ok, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag System Settings
const paths = {
  '/api/system-settings': {
    get: {
      tags: ['System Settings'],
      summary: 'Get system settings with meta',
      description: 'Requires permission: settings. Returns general, receipt (entryBill, paymentBill, printer, footerText), billing, and configUpdatedAt. Before the first PUT the backend returns its default settings, so every key is always present.',
      responses: { 200: ok('System settings'), ...bearer403 },
    },
    put: {
      tags: ['System Settings'],
      summary: 'Update system settings',
      description: 'Requires permission: settings. Fields are merged into the current values of each group (general, receipt including entryBill/paymentBill/printer, billing); fields not sent keep their current value. receipt.paymentBill.expiryDuration is the exit window in minutes and must be an integer between 1 and 1440. entryBill/paymentBill show* fields must be booleans. receipt.printer fontSize, billNumberFontSize, and paperWidth accept a number or a numeric string greater than 0 and are stored as numbers; printer.paperWidth is the paper width in millimetres (receipt.paperWidth is no longer used and is dropped). general.language is th or en, general.timezone must be Asia/Bangkok, billing.taxEnabled is a boolean, billing.currency must be THB, and billing.roundingMode must be normal.',
      requestBody: body(ref('SystemSettingsUpdateRequest'), { general: { systemName: 'Smart Carpark' } }),
      responses: { 200: ok('System settings updated', ref('SuccessMessageResponse')), ...configWriteResponses },
    },
  },
};

export default paths;
