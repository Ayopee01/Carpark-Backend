// Import Docs
import components from './components.docs';
import { bearer } from './helpers';
import authPaths from './auth.docs';
import dashboardPaths from './dashboard.docs';
import overviewPaths from './overview.docs';
import transactionsPaths from './transactions.docs';
import membersPaths from './members.docs';
import pricingPaths from './pricing.docs';
import paymentSettingsPaths from './payment-settings.docs';
import paymentGatewayPaths from './payment-gateway.docs';
import paymentsPaths from './payments.docs';
import devicesPaths from './devices.docs';
import clientEventsPaths from './client-events.docs';
import themePaths from './theme.docs';
import systemSettingsPaths from './system-settings.docs';

/* -------------------------------------- Config -------------------------------------- */

// Config OpenAPI schema ที่ sync กับ Express routes ใช้เป็น API contract ของ Swagger UI
const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Smart Carpark API',
    version: '1.0.0',
    description: [
      'Current API contract for the Smart Carpark backend.',
      'Admin endpoints use Bearer access tokens. Device endpoints use X-Device-Id plus X-Device-Token, or Authorization: Device <token>.',
      'Public/client endpoints are grouped under /api/client (including the public GET /api/client/config). Admin device management is grouped under /api/devices. Paths have no version segment (/api/..., not /api/v1/...).',
    ].join('\n'),
  },
  servers: [
    { url: '/', description: 'Same origin' },
  ],
  tags: [
    { name: 'Auth', description: 'Login, refresh token, logout, and current user endpoints.' },
    { name: 'Dashboard', description: 'Admin dashboard. Requires dashboard permission.' },
    { name: 'Overview', description: 'Admin overview reports. Requires overview permission.' },
    { name: 'Transactions', description: 'Admin transaction operations. Every endpoint in this group requires Auth Bearer token and transactions permission.' },
    { name: 'Members', description: 'Member and permission management. Requires settings permission.' },
    { name: 'Pricing', description: 'Pricing configuration. Requires pricing permission.' },
    { name: 'Payment Settings', description: 'Payment methods and channel mapping. Requires pricing permission.' },
    { name: 'Payment Gateway', description: 'Omise charge creation, webhook callback, and realtime payment updates.' },
    { name: 'Payments', description: 'Admin Omise payment endpoints. Requires transactions permission.' },
    { name: 'Devices', description: 'Unified admin management for kiosk, barrier gate, and other devices. Requires devices permission.' },
    { name: 'Dev Test', description: 'Endpoints for testing the parking and payment flow without a real payment gateway.' },
    { name: 'Client Events', description: 'Shared public/device endpoints for kiosk, barrier gate, and mobile clients.' },
    { name: 'Theme', description: 'Theme and logo configuration. Requires theme permission.' },
    { name: 'System Settings', description: 'General, receipt, and printer settings. Requires settings permission.' },
  ],
  components,
  security: bearer,
  paths: {
    ...authPaths,
    ...dashboardPaths,
    ...overviewPaths,
    ...transactionsPaths,
    ...membersPaths,
    ...pricingPaths,
    ...paymentSettingsPaths,
    ...paymentGatewayPaths,
    ...paymentsPaths,
    ...devicesPaths,
    ...clientEventsPaths,
    ...themePaths,
    ...systemSettingsPaths,
  },
};

export default openapi;
