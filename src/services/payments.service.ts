// Import Services
import * as deviceRegistryService from './shared/device-registry.service';
import * as omisePaymentService from './shared/omise-payment.service';
import * as paymentSelectionService from './shared/payment-selection.service';
// Import Types
import type { AdminChargeInput, AvailablePaymentMethod, GatewayChargeEvent, GatewayProcessResult, OmiseChargeResponse, OmiseDocumentFile } from '../types/shared/payment.type';
import type { UserApi } from '../types/shared/user.type';
// Import Validation
import { resolveRefundBodySchema } from '../validation/schemas';
import { parseWithSchema } from '../validation/parser';

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงเครื่อง EDC ของเคาน์เตอร์ที่ใช้ได้ ให้พนักงานเลือกเครื่องที่ใช้รับบัตร
async function listCashierEdcDevices(): Promise<{ data: { deviceId: string | null; deviceName: string; terminalId: string | undefined; location: string | null; provider: string | null }[] }> {
  const devices = await deviceRegistryService.listCashierEdcDevices();
  return {
    data: devices.map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      terminalId: device.terminalId,
      location: device.location || null,
      provider: device.provider || null,
    })),
  };
}

// Function ดึงวิธีชำระที่เปิดใช้งานของ Admin (channel cashier) บัตรแสดงเฉพาะเมื่อมีเครื่อง EDC ของเคาน์เตอร์ที่ active
async function listPaymentMethods(): Promise<{ channel: 'cashier'; methods: AvailablePaymentMethod[] }> {
  const [methods, edcDevices] = await Promise.all([paymentSelectionService.listAvailableMethods('cashier'), deviceRegistryService.listCashierEdcDevices()]);
  return { channel: 'cashier' as const, methods: methods.filter((method) => method.id !== 'card' || edcDevices.length > 0) };
}

// Function สร้าง Omise charge ของ Admin/Cashier (channel ต้องเป็น cashier)
async function createOmiseCharge(body: AdminChargeInput = {}, user?: UserApi | null): Promise<{ message: string; charge: OmiseChargeResponse }> {
  const charge = await omisePaymentService.createOmiseChargeForAdmin({
    transactionId: body.transactionId,
    plateNo: body.plateNo,
    source: body.source,
    token: body.token,
    sourceType: body.sourceType,
    method: body.method,
    channel: body.channel || 'cashier',
    amount: body.amount,
    processedBy: user?.id ?? null,
    returnUri: body.returnUri,
  });
  return { message: 'created', charge };
}

// Function ดึงรูป QR PromptPay ของ charge ที่ Admin สร้าง
async function getOmiseQrImage(query: { chargeId?: unknown; documentPath?: unknown } = {}): Promise<OmiseDocumentFile> {
  return omisePaymentService.getOmiseQrImage(query);
}

// Function ตรวจสถานะ charge กับ Omise เมื่อพนักงานกดตรวจสอบ (ผลที่จ่ายแล้วส่ง payments:updated ทาง Socket.IO ด้วย)
async function verifyOmiseCharge(chargeId: string): Promise<{ message: string } & GatewayProcessResult> {
  const result = await omisePaymentService.verifyOmiseCharge(chargeId);
  return { message: 'Charge verified', ...result };
}

// Function บันทึกว่า Admin คืนเงินของ charge แล้ว
async function resolveOmiseRefund(chargeId: string, body: unknown, user?: UserApi | null): Promise<{ message: string; charge: GatewayChargeEvent | null }> {
  const { note } = parseWithSchema(resolveRefundBodySchema, body);
  const charge = await omisePaymentService.resolveGatewayRefund(chargeId, { note: note || null, resolvedBy: user?.id || null });
  return { message: 'Refund resolved', charge: omisePaymentService.toGatewayChargeEvent(charge) };
}

export { createOmiseCharge, getOmiseQrImage, listCashierEdcDevices, listPaymentMethods, resolveOmiseRefund, verifyOmiseCharge };
