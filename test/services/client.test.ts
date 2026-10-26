// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture, stub } from '../support/mock';
// Import Repositories
import * as chargeRepository from '../../src/repositories/shared/charge.repository';
// Import Services
import * as clientService from '../../src/services/client.service';
import * as deviceAuthService from '../../src/services/shared/device-auth.service';
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';
import * as edcService from '../../src/services/shared/edc.service';
import * as paymentSelectionService from '../../src/services/shared/payment-selection.service';
import * as transactionLookupService from '../../src/services/shared/transaction-lookup.service';
import * as transactionPaymentService from '../../src/services/shared/transaction-payment.service';
// Import Types
import type { ClientRequestContext } from '../../src/types/client.type';
import type { SafeDevice } from '../../src/types/shared/device.type';
import type { ProcessPaymentInput } from '../../src/types/shared/transaction.type';

/* -------------------------------------- Test Helpers -------------------------------------- */

const { resolveClientSource } = clientService;

// Function mock รายการ t_1 ที่ยังจ่ายได้ (payments = รายการจ่ายที่บันทึกไว้แล้ว) และ QR ที่ยังรอจ่ายของรายการ (ไม่ส่ง = ไม่มี QR ค้าง)
function mockEdcTransaction(t: test.TestContext, { payments = [], pendingCharges = [] }: { payments?: object[]; pendingCharges?: object[] } = {}): void {
  stub(t, transactionLookupService, { findTransactionByIdOrPlateNo: async () => ({ id: 't_1', plateNo: 'ABC1234', status: 'pending', exitAt: null, payments }) });
  stub(t, chargeRepository, { listPendingGatewayChargesByTransactionId: async () => pendingCharges });
}

// Function สร้าง request context ของ Kiosk ที่ผ่าน device auth แล้วและผูก EDC-1 ไว้
function kioskContext(): ClientRequestContext {
  return { device: fixture<SafeDevice>({ deviceId: 'K-1', deviceType: 'kiosk', status: 'active', edcDeviceId: 'EDC-1' }) };
}

/* -------------------------------------- Tests -------------------------------------- */

test('request without deviceId is treated as mobile', async () => {
  assert.deepEqual(await resolveClientSource(undefined, {}), { clientType: 'mobile', device: null });
});

test('deviceId without verified device credentials is rejected', async () => {
  // มีแค่ deviceId แต่ไม่ผ่าน device auth ต้องไม่ถูกนับเป็น kiosk/gate
  await assert.rejects(resolveClientSource('BG-1', {}), { statusCode: 401, code: 'DEVICE_CREDENTIALS_REQUIRED' });

  // device ที่ auth แล้วต้องตรงกับ deviceId ที่ส่งมา
  await assert.rejects(resolveClientSource('BG-1', { device: fixture<SafeDevice>({ deviceId: 'K-1', deviceType: 'kiosk', status: 'active' }) }), { statusCode: 401 });
});

test('client realtime heartbeat stops when the device token is no longer valid', async (t) => {
  const heartbeats: string[] = [];
  stub(t, deviceAuthService, { verifyRegisteredDeviceToken: async (deviceId, token) => (token === 'valid' ? { ok: true, device: { deviceId, deviceType: 'kiosk', allowedIps: [] } } : { ok: false, reason: 'invalid_token' }) });
  stub(t, deviceRegistryService, { updateRegisteredDeviceHeartbeat: async (deviceId) => heartbeats.push(deviceId) });

  assert.deepEqual(await clientService.refreshDeviceHeartbeat('K-1', 'valid', '127.0.0.1'), { ok: true });
  // หลัง reissue token เดิมใช้ไม่ได้ ต้องไม่ทำให้อุปกรณ์กลับมา online
  assert.deepEqual(await clientService.refreshDeviceHeartbeat('K-1', 'old', '127.0.0.1'), { ok: false, reason: 'invalid_token' });
  assert.deepEqual(heartbeats, ['K-1']);
});

test('client realtime heartbeat stops when the device IP is no longer allowed', async (t) => {
  const heartbeats: string[] = [];
  const blockedReports: string[] = [];
  stub(t, deviceAuthService, {
    verifyRegisteredDeviceToken: async () => ({ ok: true, device: { deviceId: 'K-1', deviceType: 'kiosk', allowedIps: ['10.0.0.5'] } }),
    reportDeviceIpBlocked: (_device, ip) => blockedReports.push(String(ip)),
  });
  stub(t, deviceRegistryService, { updateRegisteredDeviceHeartbeat: async (deviceId) => heartbeats.push(deviceId) });

  assert.deepEqual(await clientService.refreshDeviceHeartbeat('K-1', 'valid', '10.0.0.5'), { ok: true });
  // Admin แก้ allowedIps ระหว่างเปิด stream ใช้ reason เดียวกับ HTTP 403
  assert.deepEqual(await clientService.refreshDeviceHeartbeat('K-1', 'valid', '10.0.0.6'), { ok: false, reason: 'ip_not_allowed' });
  assert.deepEqual([heartbeats, blockedReports], [['K-1'], ['10.0.0.6']]);
});

test('Kiosk EDC payment is stored as unverified until a card provider verifier exists, and a rejected approval is not recorded', async (t) => {
  const payments: ProcessPaymentInput[] = [];
  const results = [{ status: 'unverified' }, { status: 'rejected', reason: 'approval_not_found' }];
  stub(t, deviceRegistryService, {
    updateRegisteredDeviceHeartbeat: async () => null,
    resolveDeviceEdc: async () => ({ ok: true, edc: { deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', terminalId: 'TID-1', status: 'active', provider: 'kbank' } }),
  });
  stub(t, edcService, { verifyEdcApproval: async () => results.shift() });
  mockEdcTransaction(t);
  stub(t, transactionPaymentService, { processPayment: async (_id, options) => {
    payments.push(options ?? {});
    return { id: 't_1', plateNo: 'ABC1234', status: 'paid_waiting_exit' };
  } });
  const body = { transactionId: 't_1', amount: 40, reference: 'APPR-1', terminalId: 'TID-1' };

  await clientService.payByEdc({ body, deviceId: 'K-1', context: kioskContext() });
  await assert.rejects(clientService.payByEdc({ body, deviceId: 'K-1', context: kioskContext() }), { statusCode: 402, code: 'EDC_APPROVAL_REJECTED', details: { reason: 'approval_not_found' } });

  assert.deepEqual(payments.map((payment) => payment.edcVerification), ['unverified']);
});

test('EDC approval without a verifier for the provider is unverified', async () => {
  assert.deepEqual(await edcService.verifyEdcApproval({ provider: 'unknown-bank', terminalId: 'TID-1', reference: 'APPR-1', amount: 40 }), { status: 'unverified' });
  assert.deepEqual(await edcService.verifyEdcApproval({ provider: null, terminalId: 'TID-1', reference: 'APPR-1', amount: 40 }), { status: 'unverified' });
});

test('Kiosk records an EDC card payment with its reference as a kiosk card payment', async (t) => {
  const payments: (ProcessPaymentInput & { id: string | null })[] = [];
  stub(t, deviceRegistryService, { updateRegisteredDeviceHeartbeat: async () => null });
  stub(t, deviceRegistryService, { resolveDeviceEdc: async () => ({ ok: true, edc: { deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', terminalId: 'TID-1', status: 'active' } }) });
  mockEdcTransaction(t);
  stub(t, transactionPaymentService, { processPayment: async (id, options) => {
    payments.push({ id, ...options });
    return { id: 't_1', plateNo: 'ABC1234', status: 'paid_waiting_exit', ...(payments.length > 1 ? { duplicatePayment: true } : {}) };
  } });
  const context = kioskContext();
  const body = { transactionId: 't_1', amount: 40, reference: 'APPR-1', terminalId: 'TID-1' };

  const first = await clientService.payByEdc({ body, deviceId: 'K-1', context });
  // Kiosk retry หลังเน็ตหลุด ได้ผลเดิมพร้อม duplicate: true
  const retry = await clientService.payByEdc({ body, deviceId: 'K-1', context });

  assert.ok(payments[0]);
  assert.deepEqual([payments[0].method, payments[0].channel, payments[0].reference, payments[0].terminalId, payments[0].edcDeviceId, payments[0].amount], ['card', 'kiosk', 'APPR-1', 'TID-1', 'EDC-1', 40]);
  assert.deepEqual([first.duplicate, retry.duplicate], [false, true]);
  assert.equal('duplicatePayment' in retry.transaction, false);
});

test('Kiosk EDC payment is refused while a QR of the transaction can still be paid, but a retry of a recorded reference still returns', async (t) => {
  const recorded: (string | null)[] = [];
  stub(t, deviceRegistryService, {
    updateRegisteredDeviceHeartbeat: async () => null,
    resolveDeviceEdc: async () => ({ ok: true, edc: { deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', terminalId: 'TID-1', status: 'active' } }),
  });
  stub(t, transactionPaymentService, { processPayment: async (id) => (recorded.push(id), { id: 't_1', plateNo: 'ABC1234', status: 'paid_waiting_exit', duplicatePayment: true }) });
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const pendingQr = { chargeId: 'chrg_qr', method: 'promptpay', channel: 'kiosk', amount: 4000, raw: { expires_at: expiresAt } };
  const body = { transactionId: 't_1', amount: 40, reference: 'APPR-1', terminalId: 'TID-1' };

  mockEdcTransaction(t, { pendingCharges: [pendingQr] });
  // PromptPay ยกเลิกผ่าน Omise ไม่ได้ ตู้ต้อง void บัตรที่เครื่อง EDC แทน
  await assert.rejects(clientService.payByEdc({ body, deviceId: 'K-1', context: kioskContext() }), { statusCode: 409, code: 'PENDING_GATEWAY_CHARGE', details: { chargeId: 'chrg_qr', method: 'promptpay', channel: 'kiosk', amount: 4000, expiresAt } });
  assert.deepEqual(recorded, []);

  // reference นี้บันทึกไปแล้วก่อนมี QR (ตู้ส่งซ้ำหลังเน็ตหลุด) ต้องได้ผลเดิม ไม่ใช่ให้ void
  mockEdcTransaction(t, { payments: [{ id: 'pay_1', method: 'card', reference: 'APPR-1', terminalId: 'TID-1' }], pendingCharges: [pendingQr] });
  const retry = await clientService.payByEdc({ body, deviceId: 'K-1', context: kioskContext() });
  assert.deepEqual([retry.duplicate, recorded], [true, ['t_1']]);
});

test('EDC payment requires amount, reference, terminalId and a transaction', async () => {
  const context = kioskContext();
  const valid = { transactionId: 't_1', amount: 40, reference: 'APPR-1', terminalId: 'TID-1' };

  for (const missing of ['amount', 'reference', 'terminalId', 'transactionId']) {
    const body: Record<string, unknown> = { ...valid };
    delete body[missing];
    await assert.rejects(clientService.payByEdc({ body, deviceId: 'K-1', context }), { code: 'VALIDATION_ERROR' });
  }
});

test('EDC payment must come from the active EDC terminal bound to the device', async (t) => {
  const body = { transactionId: 't_1', amount: 40, reference: 'APPR-1', terminalId: 'TID-2' };
  const context = kioskContext();
  const bindings = [{ ok: false, reason: 'not_configured' }, { ok: false, reason: 'unavailable' }, { ok: true, edc: { deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', terminalId: 'TID-1', status: 'active' } }];
  stub(t, deviceRegistryService, { resolveDeviceEdc: async () => bindings.shift() });

  await assert.rejects(clientService.payByEdc({ body, deviceId: 'K-1', context }), { statusCode: 403, code: 'EDC_TERMINAL_NOT_CONFIGURED' });
  await assert.rejects(clientService.payByEdc({ body, deviceId: 'K-1', context }), { statusCode: 403, code: 'EDC_TERMINAL_UNAVAILABLE' });
  // EDC ที่ผูกไว้คือ TID-1 แต่ผลส่งมาจาก TID-2
  await assert.rejects(clientService.payByEdc({ body, deviceId: 'K-1', context }), { statusCode: 403, code: 'EDC_TERMINAL_MISMATCH' });
});

test('payment methods follow the client channel and show card only when the bound EDC is active', async (t) => {
  stub(t, deviceRegistryService, { updateRegisteredDeviceHeartbeat: async () => null });
  stub(t, paymentSelectionService, { listAvailableMethods: async () => [{ id: 'promptpay' }, { id: 'card' }] });
  const bindings = [{ ok: true, edc: { deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', terminalId: 'TID-1', status: 'active' } }, { ok: false, reason: 'not_configured' }];
  stub(t, deviceRegistryService, { resolveDeviceEdc: async () => bindings.shift() });
  const context = kioskContext();

  const kiosk = await clientService.getPaymentMethods({ deviceId: 'K-1' }, context);
  const kioskWithoutEdc = await clientService.getPaymentMethods({ deviceId: 'K-1' }, context);
  // mobile ไม่มีเครื่อง EDC จึงไม่มีบัตรแม้ setting จะเปิด
  const mobile = await clientService.getPaymentMethods({}, {});

  assert.deepEqual([kiosk.channel, kiosk.methods.map((method) => method.id), kiosk.edc], ['kiosk', ['promptpay', 'card'], { deviceId: 'EDC-1', deviceName: 'EDC Kiosk 1', terminalId: 'TID-1' }]);
  assert.deepEqual([kioskWithoutEdc.methods.map((method) => method.id), kioskWithoutEdc.edc], [['promptpay'], null]);
  assert.deepEqual([mobile.channel, mobile.methods.map((method) => method.id)], ['mobile', ['promptpay']]);
});
