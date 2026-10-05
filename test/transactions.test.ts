// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
// Import Test Helpers
import { fixture, stub } from './support/mock';
// Import Config
import { prisma } from '../src/db/prisma';
// Import Repositories
import * as transactionsRepository from '../src/repositories/transactions.repository';
// Import Services
import * as deviceRegistryService from '../src/services/shared/device-registry.service';
import * as omisePaymentService from '../src/services/shared/omise-payment.service';
import * as transactionLookupService from '../src/services/shared/transaction-lookup.service';
import * as transactionPaymentService from '../src/services/shared/transaction-payment.service';
import * as transactionsService from '../src/services/transactions.service';
// Import Types
import type { SafeDevice } from '../src/types/shared/device.type';
import type { CameraTransactionDto, ProcessPaymentInput } from '../src/types/shared/transaction.type';
// Import Utils
import type { ApiError } from '../src/utils/api-error';
import { appEvents } from '../src/utils/events';

/* -------------------------------------- Types -------------------------------------- */

// Type ข้อมูล transaction ที่ mock repository ได้รับตอนสร้าง/แก้ไข
interface CameraWrite {
  plateNo?: string;
  status?: string;
  netAmount?: number;
  entryAt?: Date;
  exitAt?: Date;
  receipt?: { camera?: { gateId?: string | null; direction?: string } };
}

// Type รายการที่ mock repository บันทึกไว้ตรวจ
interface CameraWrites {
  created: CameraWrite | null;
  updated: CameraWrite | null;
  updates: { id: string; data: CameraWrite }[];
}

// Type event lpr_detected ที่ test ตรวจ
interface LprEvent {
  action: string | null;
  openGate: boolean;
  paymentRequired: boolean;
  reason: string | null;
  netAmount: number;
  gateId: string | null;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function สร้าง DTO กล้องจากข้อมูลที่ test ต้องใช้
function cameraDto(value: Partial<CameraTransactionDto>): CameraTransactionDto {
  return fixture<CameraTransactionDto>(value);
}

// Function mock repository ของ transaction และคืน record ที่ถูกสร้าง/แก้ไขไว้ตรวจ
function mockCameraRepository(t: TestContext, { recent = [], open = null, priced = open }: { recent?: object[]; open?: object | null; priced?: object | null } = {}): CameraWrites {
  const writes: CameraWrites = { created: null, updated: null, updates: [] };
  stub(t, prisma, { $transaction: async (callback) => callback(prisma) });
  stub(t, transactionsRepository, {
    lockPlateNo: async () => {},
    listRecentTransactionsByPlateNo: async () => recent,
    findOpenTransactionByPlateNo: async () => open,
    createTransactionRecord: async (data) => {
      writes.created = data as CameraWrite;
      return data;
    },
    updateTransactionRecord: async (id, data) => {
      writes.updated = data as CameraWrite;
      writes.updates.push({ id, data: data as CameraWrite });
      return { ...open, ...data };
    },
  });
  stub(t, transactionLookupService, { getTransactionApiById: async () => priced });
  return writes;
}

// Function เก็บ lpr_detected event ล่าสุดระหว่าง test
function captureLprEvent(t: TestContext): { event: LprEvent | null } {
  const captured: { event: LprEvent | null } = { event: null };
  const listener = (event: LprEvent) => {
    captured.event = event;
  };
  appEvents.on('lpr_detected', listener);
  t.after(() => appEvents.off('lpr_detected', listener));
  return captured;
}

/* -------------------------------------- Tests -------------------------------------- */

test('fills gateId from the barrier gate mapping when the camera payload omits it', async (t) => {
  const writes = mockCameraRepository(t);
  stub(t, deviceRegistryService, {
    validateCameraGateBinding: async (dto) => {
      assert.equal(dto?.gateId, null);
      return { ok: true, barrierGate: { gateId: 'GATE-A' } };
    },
  });

  const result = await transactionsService.handleCameraTransaction({ plateNo: 'ABC-1234', cameraId: 'CAM-IN-01', direction: 'in', capturedAt: '2026-05-22T10:30:00+07:00' });

  assert.equal(result.statusCode, 201);
  assert.equal(writes.created?.plateNo, 'ABC1234');
  assert.equal(writes.created?.receipt?.camera?.gateId, 'GATE-A');
  assert.equal(writes.created?.receipt?.camera?.direction, 'IN');
});

test('rejects invalid camera payload with field errors', async () => {
  await assert.rejects(transactionsService.handleCameraTransaction({ cameraId: 'CAM-1', direction: 'SIDE', vehicleType: 'truck' }), (error: ApiError) => {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.details.action, 'VALIDATION_ERROR');
    assert.deepEqual((error.details.errors as { field: string }[]).map((item) => item.field), ['plateNo', 'direction', 'vehicleType']);
    return true;
  });
});

test('rejects a camera that posts another camera id', async () => {
  const device = fixture<SafeDevice>({ deviceId: 'CAM-1', deviceType: 'camera' });
  await assert.rejects(transactionsService.handleCameraTransaction({ plateNo: 'ABC1234', cameraId: 'CAM-2', direction: 'IN' }, device), { code: 'CAMERA_ID_MISMATCH' });
});

test('ignores a repeated camera event within the duplicate window', async (t) => {
  const capturedAt = new Date('2026-05-01T10:00:00.000Z');
  const duplicate = { id: 't_existing', plateNo: 'ABC1234', status: 'pending', receipt: { camera: { cameraId: 'CAM-1', direction: 'IN', capturedAt: '2026-05-01T10:00:05.000Z' } } };
  const writes = mockCameraRepository(t, { recent: [duplicate] });

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-1', direction: 'IN', capturedAt }));

  assert.equal(result.body.action, 'IGNORE_DUPLICATE');
  assert.equal(result.body.openGate, false);
  assert.equal(writes.created, null);
});

test('does not create another IN transaction while the plate has an open transaction', async (t) => {
  const open = { id: 't_open', plateNo: 'ABC1234', status: 'pending', receipt: { camera: { direction: 'OUT' } } };
  const writes = mockCameraRepository(t, { open });
  const lpr = captureLprEvent(t);

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-1', direction: 'IN', capturedAt: new Date() }));

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.action, 'IGNORE_ACTIVE_TRANSACTION');
  assert.equal(result.body.data.direction, 'IN');
  // success = ประมวลผลได้ แต่ไม่เปิดไม้กั้น ต้องให้เจ้าหน้าที่ตรวจรายการที่ค้างอยู่
  assert.deepEqual([result.body.success, result.body.openGate, lpr.event?.openGate], [true, false, false]);
  assert.equal(lpr.event?.paymentRequired, false);
  assert.equal(writes.created, null);
});

test('blocks OUT while the transaction is pending or partially paid', async (t) => {
  const messages: Record<string, string> = {
    pending: 'รายการนี้ยังชำระเงินไม่ครบ กรุณาชำระเงินก่อนออก',
    partially_paid: 'หมดเวลาออกหลังชำระเงินแล้ว กรุณาชำระเงินใหม่ก่อนออก',
  };

  for (const status of ['pending', 'partially_paid']) {
    await t.test(status, async (st) => {
      const open = { id: `t_${status}`, plateNo: 'ABC1234', status, exitTimeLimit: null, remainingAmount: 40, receipt: { camera: { direction: 'IN' } } };
      const writes = mockCameraRepository(st, { open });

      const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-OUT', direction: 'OUT', capturedAt: new Date() }));

      assert.equal(result.body.action, 'PAYMENT_REQUIRED');
      assert.equal(result.body.message, messages[status]);
      assert.equal(result.body.data.reason, status);
      assert.equal(writes.updated, null);
    });
  }
});

test('blocks OUT when the current calculated remaining amount is still due', async (t) => {
  const open = { id: 't_due', plateNo: 'ABC1234', status: 'paid_waiting_exit', exitTimeLimit: '2099-05-01T10:15:00.000Z', receipt: {} };
  // stored status บอกว่าจ่ายแล้ว แต่ราคาที่คำนวณใหม่ยังเหลือยอดค้าง
  const priced = { ...open, status: 'partially_paid', remainingAmount: 20, netAmount: 40, totalPaid: 20 };
  mockCameraRepository(t, { open, priced });
  const lpr = captureLprEvent(t);

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-OUT', direction: 'OUT', capturedAt: new Date() }));

  assert.equal(result.body.action, 'PAYMENT_REQUIRED');
  assert.equal(result.body.data.remainingAmount, 20);
  assert.equal(lpr.event?.reason, 'partially_paid');
  assert.equal(lpr.event?.netAmount, 40);
});

test('blocks OUT after the exit window when the overstay adds a fee', async (t) => {
  const open = { id: 't_expired', plateNo: 'ABC1234', status: 'paid_waiting_exit', exitTimeLimit: '2026-05-01T10:15:00.000Z', receipt: {} };
  // หมด exitTimeLimit แล้ว ค่าจอดที่คำนวณถึงตอนนี้เพิ่มขึ้น 20 บาท
  const priced = { ...open, status: 'partially_paid', remainingAmount: 20, netAmount: 60, totalPaid: 40 };
  const writes = mockCameraRepository(t, { open, priced });

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-OUT', direction: 'OUT', capturedAt: new Date() }));

  assert.equal(result.body.action, 'PAYMENT_REQUIRED');
  assert.equal(result.body.openGate, false);
  assert.equal(result.body.data.reason, 'partially_paid');
  assert.equal(result.body.data.remainingAmount, 20);
  assert.equal(writes.updated, null);
});

test('opens the gate after the exit window when the overstay adds no fee', async (t) => {
  // จ่าย 08:10 เลยเวลาออก 08:40 แต่ถึงไม้กั้น 08:45 ยังอยู่ในชั่วโมงเดิม จึงไม่มียอดให้จ่ายเพิ่ม
  const open = { id: 't_expired', plateNo: 'ABC1234', status: 'paid_waiting_exit', exitTimeLimit: '2026-05-01T01:40:00.000Z', receipt: {} };
  const priced = { ...open, status: 'paid_waiting_exit', remainingAmount: 0, netAmount: 40, totalPaid: 40 };
  const writes = mockCameraRepository(t, { open, priced });

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-OUT', direction: 'OUT', capturedAt: new Date() }));

  assert.equal(result.body.action, 'OPEN_GATE');
  assert.equal(writes.updated?.status, 'completed');
  assert.equal(writes.updated?.netAmount, 40);
});

test('opens the gate for free parking that has nothing to pay', async (t) => {
  const open = { id: 't_free', plateNo: 'ABC1234', status: 'pending', exitTimeLimit: null, receipt: {} };
  const priced = { ...open, remainingAmount: 0, netAmount: 0, totalPaid: 0 };
  mockCameraRepository(t, { open, priced });

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-OUT', direction: 'OUT', capturedAt: new Date() }));

  assert.equal(result.body.action, 'OPEN_GATE');
});

test('closes a paid transaction whose OUT event was missed when the plate enters again', async (t) => {
  const open = { id: 't_paid', plateNo: 'ABC1234', status: 'paid_waiting_exit', exitTimeLimit: '2026-05-01T03:00:00.000Z', receipt: {} };
  const writes = mockCameraRepository(t, { open });
  const capturedAt = new Date('2026-05-02T01:00:00.000Z');

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-IN', direction: 'IN', capturedAt }));

  assert.equal(result.body.action, 'OPEN_GATE');
  assert.deepEqual([writes.updates[0]?.id, writes.updates[0]?.data.status], ['t_paid', 'completed']);
  assert.equal(writes.updates[0]?.data.exitAt?.toISOString(), '2026-05-01T03:00:00.000Z');
  assert.equal(writes.created?.entryAt?.toISOString(), capturedAt.toISOString());
});

test('reads a camera time without timezone as Bangkok time and ignores a clock far in the future', () => {
  const dto = transactionsService.toCameraTransactionDto({ plateNo: 'abc-1234', cameraId: 'CAM-1', direction: 'in', capturedAt: '2026-05-01 08:00:00' });
  assert.equal(dto.capturedAt.toISOString(), '2026-05-01T01:00:00.000Z');
  assert.equal(dto.plateNo, 'ABC1234');

  const future = transactionsService.toCameraTransactionDto({ plateNo: 'ABC1234', cameraId: 'CAM-1', direction: 'IN', capturedAt: '2999-01-01T00:00:00+07:00' });
  assert.ok(Math.abs(future.capturedAt.getTime() - Date.now()) < 5000);
});

test('opens the gate and completes the transaction when paid inside the exit window', async (t) => {
  const open = { id: 't_paid', plateNo: 'ABC1234', status: 'paid_waiting_exit', exitTimeLimit: '2099-05-01T10:15:00.000Z', receipt: { camera: { direction: 'IN' } } };
  const writes = mockCameraRepository(t, { open });
  const lpr = captureLprEvent(t);

  const result = await transactionsService.createTransactionFromCamera(cameraDto({ plateNo: 'ABC1234', cameraId: 'CAM-OUT', gateId: 'GATE-A', direction: 'OUT', capturedAt: new Date() }));

  assert.equal(result.statusCode, 201);
  assert.equal(result.body.data.status, 'completed');
  assert.equal(writes.updated?.status, 'completed');
  assert.equal(lpr.event?.action, 'OPEN_GATE');
  assert.deepEqual([result.body.openGate, result.body.data.openGate, lpr.event?.openGate], [true, true, true]);
  assert.equal(lpr.event?.gateId, 'GATE-A');
});

test('asks Admin to confirm a cash payment while a QR is still payable', async (t) => {
  const paid: ProcessPaymentInput[] = [];
  stub(t, transactionsRepository, { findLatestExactTransactionByPlateNo: async () => ({ id: 't_1', plateNo: 'ABC1234' }) });
  stub(t, omisePaymentService, {
    findActiveGatewayCharge: async () => ({ chargeId: 'chrg_1', method: 'promptpay', channel: 'cashier', amount: 4000, expiresAt: '2026-10-01T10:10:00.000Z' }),
  });
  stub(t, transactionPaymentService, {
    processPaymentByPlateNo: async (plateNo, options) => {
      paid.push(options ?? {});
      return { id: 't_1', plateNo, status: 'paid_waiting_exit', payments: [] };
    },
  });

  await assert.rejects(
    transactionsService.payTransactionByPlateNo('ABC1234', { method: 'cash', channel: 'cashier' }),
    { statusCode: 409, code: 'PENDING_GATEWAY_CHARGE' },
  );
  assert.equal(paid.length, 0);

  // Admin ยืนยันว่าจะรับเงินสดต่อ
  await transactionsService.payTransactionByPlateNo('ABC1234', { method: 'cash', channel: 'cashier', confirmPendingCharge: true });
  assert.equal(paid.length, 1);
});

test('records Admin payments as cashier and rejects other channels', async (t) => {
  const paid: ProcessPaymentInput[] = [];
  stub(t, transactionsRepository, { findLatestExactTransactionByPlateNo: async () => null });
  stub(t, transactionPaymentService, {
    processPaymentByPlateNo: async (plateNo, options) => {
      paid.push(options ?? {});
      return { id: 't_1', plateNo, status: 'paid_waiting_exit', payments: [] };
    },
  });

  await assert.rejects(transactionsService.payTransactionByPlateNo('ABC1234', { method: 'promptpay', channel: 'gate' }), { code: 'ADMIN_CHANNEL_MUST_BE_CASHIER' });
  // บัตรรับผ่านเครื่อง EDC ของเคาน์เตอร์ ต้องมีเลขอ้างอิงและเครื่อง EDC ที่เลือก
  const cashierEdc: Record<string, object> = { 'EDC-C1': { ok: true, edc: { deviceId: 'EDC-C1', terminalId: 'TID-C1' } }, 'EDC-K1': { ok: false, reason: 'not_cashier' } };
  stub(t, deviceRegistryService, { getCashierEdc: async (id) => cashierEdc[id ?? ''] || { ok: false, reason: 'not_found' } });
  await assert.rejects(transactionsService.payTransactionByPlateNo('ABC1234', { method: 'card', edcDeviceId: 'EDC-C1' }), { code: 'PAYMENT_REFERENCE_REQUIRED' });
  await assert.rejects(transactionsService.payTransactionByPlateNo('ABC1234', { method: 'card', reference: 'APPR-1' }), { code: 'EDC_DEVICE_REQUIRED' });
  await assert.rejects(transactionsService.payTransactionByPlateNo('ABC1234', { method: 'card', reference: 'APPR-1', edcDeviceId: 'EDC-K1' }), { code: 'EDC_DEVICE_NOT_CASHIER' });
  await transactionsService.payTransactionByPlateNo('ABC1234', { method: 'card', reference: 'APPR-123456', edcDeviceId: 'EDC-C1' });
  await transactionsService.payTransactionByPlateNo('ABC1234', { method: 'cash', channel: 'cashier', deviceId: 'POS-1' });
  assert.deepEqual([paid[0]?.reference, paid[0]?.terminalId, paid[0]?.edcDeviceId], ['APPR-123456', 'TID-C1', 'EDC-C1']);
  assert.deepEqual([paid[1]?.channel, paid[1]?.source, paid[1]?.device?.deviceType], ['cashier', 'admin', 'admin']);
});

test('validates Admin transaction updates and blocks reopening a closed transaction', async (t) => {
  const closed = { id: 't_done', plateNo: 'ABC1234', status: 'completed', exitAt: new Date(), payments: [], totalPaid: 0 };
  stub(t, transactionsRepository, { findLatestExactTransactionByPlateNo: async () => closed });
  stub(t, transactionLookupService, { getTransactionContext: async () => ({}) });

  await assert.rejects(transactionsService.updateTransaction('ABC1234', { totalPaid: 'abc' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(transactionsService.updateTransaction('ABC1234', { vehicleType: 'truck' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(transactionsService.updateTransaction('ABC1234', { status: 'pending' }), { statusCode: 409, code: 'INVALID_STATUS_TRANSITION' });
});

test('refuses to delete a transaction that already has payments', async (t) => {
  const deleted: string[] = [];
  stub(t, transactionsRepository, {
    findLatestExactTransactionByPlateNo: async () => ({ id: 't_paid', plateNo: 'ABC1234', payments: [{ paidAmount: 40 }], totalPaid: 40 }),
    deleteTransactionRecord: async (id) => deleted.push(id),
  });

  await assert.rejects(transactionsService.deleteTransactionByPlateNo('ABC1234'), { statusCode: 409, code: 'TRANSACTION_HAS_PAYMENTS' });
  assert.equal(deleted.length, 0);
});

test('exact plate lookup returns only the same plate and never a candidate list', async (t) => {
  const partialLookups: unknown[] = [];
  stub(t, transactionLookupService, {
    getLatestExactTransactionApiByPlateNo: async (plateNo) => (plateNo === '1กข1234' ? { id: 't_1', plateNo: '1กข1234' } : null),
    lookupTransactionApiByPlateNo: async (plateNo) => {
      partialLookups.push(plateNo);
      return { matchType: 'multiple', requiresSelection: true, query: String(plateNo), candidates: [] };
    },
  });

  const exact = await transactionsService.getTransactionByPlateNo('1กข1234', { exact: 'true' });
  assert.equal('plateNo' in exact && exact.plateNo, '1กข1234');
  // กข1234 อยู่ในทะเบียน 1กข1234 แต่ไม่ตรงทุกตัวอักษร จึงต้องได้ 404 ไม่ใช่รายการให้เลือก
  await assert.rejects(transactionsService.getTransactionByPlateNo('กข1234', { exact: '1' }), { statusCode: 404, code: 'TRANSACTION_NOT_FOUND' });
  assert.equal(partialLookups.length, 0);
  // ไม่ส่ง exact ยังค้นบางส่วนแบบเดิม
  assert.equal('matchType' in (await transactionsService.getTransactionByPlateNo('กข1234')), true);
  assert.deepEqual(partialLookups, ['กข1234']);
});
