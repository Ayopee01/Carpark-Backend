// Import Types
import type { PaymentDevice, PaymentDeviceInput, PaymentSource, PaymentSourceInput, ResolvedPaymentSource } from '../types/shared/transaction.type';

/* -------------------------------------- Config -------------------------------------- */

// Config source การชำระเงินที่ระบบรองรับ
const VALID_PAYMENT_SOURCES: ReadonlySet<string> = new Set(['kiosk', 'barrier_gate', 'mobile', 'admin']);

// Config map source กลางไปยัง payment channel
const SOURCE_TO_PAYMENT_CHANNEL: Record<PaymentSource, string> = {
  kiosk: 'kiosk',
  barrier_gate: 'gate',
  mobile: 'mobile',
  admin: 'cashier',
};

// Config alias ของชื่อ source/channel ที่รับจากหลาย flow
const SOURCE_ALIASES: Record<string, PaymentSource> = {
  gate: 'barrier_gate',
  barrier: 'barrier_gate',
  barrier_gate: 'barrier_gate',
  kiosk: 'kiosk',
  client: 'mobile',
  mobile: 'mobile',
  omise: 'mobile',
  cashier: 'admin',
  counter: 'admin',
  admin: 'admin',
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function normalize ค่า source/channel ให้เป็นรูปแบบเดียวกัน
function normalizeSourceLikeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized || null;
}

// Function normalize payment source ให้เหลือค่าที่ระบบรองรับ
function normalizePaymentSource(value: unknown): PaymentSource | null {
  const normalized = normalizeSourceLikeValue(value);
  if (!normalized) return null;

  const source = SOURCE_ALIASES[normalized] || normalized;
  return VALID_PAYMENT_SOURCES.has(source) ? (source as PaymentSource) : null;
}

// Function normalize ข้อมูล device ที่จะบันทึกกับ payment
function normalizeDeviceForPayment(device: PaymentDeviceInput | null | undefined = {}): PaymentDevice | null {
  if (!device || typeof device !== 'object') return null;

  const deviceId = device.deviceId || device.id || null;
  const deviceType = normalizePaymentSource(device.deviceType || device.type);
  const deviceName = device.deviceName || device.name || null;
  const deviceLocation = device.deviceLocation || device.location || null;

  if (!deviceId && !deviceType && !deviceName && !deviceLocation) return null;

  return {
    ...(deviceId ? { deviceId } : {}),
    ...(deviceType ? { deviceType } : {}),
    ...(deviceName ? { deviceName } : {}),
    ...(deviceLocation ? { deviceLocation } : {}),
  };
}

// Function resolve channel ที่ใช้ตรวจ payment settings
function resolvePaymentChannel(source: PaymentSource, requestedChannel: unknown): string {
  const normalizedChannel = normalizeSourceLikeValue(requestedChannel);

  if (normalizedChannel === 'admin') return SOURCE_TO_PAYMENT_CHANNEL.admin;
  if (normalizedChannel === 'barrier_gate' || normalizedChannel === 'barrier') {
    return SOURCE_TO_PAYMENT_CHANNEL.barrier_gate;
  }

  if (normalizedChannel) return normalizedChannel;

  return SOURCE_TO_PAYMENT_CHANNEL[source] || SOURCE_TO_PAYMENT_CHANNEL.admin;
}

// Function สร้าง context ไว้ตรวจสอบที่มาของ payment ย้อนหลัง
function buildPaymentSourceContext({
  source,
  inferredFrom,
  routeType,
  channel,
  processedBy,
  device,
  sourceContext,
}: PaymentSourceInput & { source: PaymentSource; inferredFrom: string }): Record<string, unknown> {
  const context = sourceContext && typeof sourceContext === 'object' && !Array.isArray(sourceContext)
    ? { ...(sourceContext as Record<string, unknown>) }
    : {};

  const normalizedDevice = normalizeDeviceForPayment(device);

  return {
    ...context,
    source,
    inferredFrom,
    ...(routeType ? { routeType } : {}),
    ...(channel ? { requestedChannel: channel } : {}),
    ...(processedBy ? { actorId: processedBy } : {}),
    ...(normalizedDevice ? { device: normalizedDevice } : {}),
  };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function resolve source/channel จาก request, device, หรือ actor
function resolvePaymentSource({
  source,
  paymentSource,
  routeType,
  channel,
  processedBy,
  device,
  sourceContext,
}: PaymentSourceInput = {}): ResolvedPaymentSource {
  const normalizedDevice = normalizeDeviceForPayment(device);

  const candidates = [
    { value: source, inferredFrom: 'source' },
    { value: paymentSource, inferredFrom: 'paymentSource' },
    { value: normalizedDevice?.deviceType, inferredFrom: 'device.deviceType' },
    { value: routeType, inferredFrom: 'routeType' },
    { value: channel, inferredFrom: 'channel' },
    {
      value: processedBy && processedBy !== 'system' ? 'admin' : null,
      inferredFrom: 'processedBy',
    },
  ];

  const matched = candidates
    .map((candidate) => ({
      source: normalizePaymentSource(candidate.value),
      inferredFrom: candidate.inferredFrom,
    }))
    .find((candidate) => candidate.source);

  const resolvedSource: PaymentSource = matched?.source || 'mobile';
  const resolvedChannel = resolvePaymentChannel(resolvedSource, channel);

  return {
    source: resolvedSource,
    channel: resolvedChannel,
    sourceContext: buildPaymentSourceContext({
      source: resolvedSource,
      inferredFrom: matched?.inferredFrom || 'default_no_device',
      routeType,
      channel,
      processedBy,
      device,
      sourceContext,
    }),
    device: normalizedDevice,
  };
}

// Function ตรวจว่า payment มาจาก Barrier Gate หรือไม่
function isGatePaymentSource(source: unknown): boolean {
  return normalizePaymentSource(source) === 'barrier_gate';
}

export { isGatePaymentSource, resolvePaymentSource };
