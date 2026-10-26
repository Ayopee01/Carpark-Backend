// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { stub } from '../support/mock';
// Import Services
import * as paymentsService from '../../src/services/payments.service';
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';
import * as paymentSelectionService from '../../src/services/shared/payment-selection.service';

/* -------------------------------------- Tests -------------------------------------- */

test('Admin payment methods show card only when an active cashier EDC exists', async (t) => {
  stub(t, paymentSelectionService, { listAvailableMethods: async () => [{ id: 'cash' }, { id: 'card' }] });
  const edcLists = [[{ deviceId: 'EDC-C1', deviceName: 'Counter 1', terminalId: 'TID-C1' }], []];
  stub(t, deviceRegistryService, { listCashierEdcDevices: async () => edcLists.shift() });

  assert.deepEqual((await paymentsService.listPaymentMethods()).methods.map((method) => method.id), ['cash', 'card']);
  assert.deepEqual((await paymentsService.listPaymentMethods()).methods.map((method) => method.id), ['cash']);
});
