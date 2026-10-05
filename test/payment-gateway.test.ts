// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { setEnv } from './support/mock';
// Import Services
import * as paymentGatewayService from '../src/services/payment-gateway.service';

/* -------------------------------------- Tests -------------------------------------- */

test('guards payment simulation with env flag and optional token', async (t) => {
  setEnv(t, { ENABLE_PAYMENT_SIMULATION: undefined, PAYMENT_SIMULATION_TOKEN: undefined });
  await assert.rejects(paymentGatewayService.simulatePaid({ body: { chargeId: 'chrg_1' } }), { statusCode: 403, code: 'PAYMENT_SIMULATION_DISABLED' });

  setEnv(t, { ENABLE_PAYMENT_SIMULATION: 'true', PAYMENT_SIMULATION_TOKEN: 'uat-secret' });
  await assert.rejects(paymentGatewayService.simulatePaid({ token: 'wrong', body: {} }), { statusCode: 401, code: 'INVALID_SIMULATION_TOKEN' });
  await assert.rejects(paymentGatewayService.simulatePaid({ token: 'uat-secret', body: {} }), { statusCode: 400, code: 'CHARGE_ID_REQUIRED' });
});
