// Import Library
import type { Server } from 'socket.io';
// Import Services
import * as clientService from '../services/client.service';
import * as deviceAuthService from '../services/shared/device-auth.service';
import * as paymentRealtimeService from '../services/shared/payment-realtime.service';
// Import Types
import type { DeviceEvent } from '../types/shared/device.type';
import type { PaymentUpdateEvent } from '../types/shared/payment.type';
import type { ClientSocket, ClientSocketData, SocketIpResolver } from '../types/shared/realtime.type';
// Import Validation
import { clientPaymentSubscribeSchema, lprFiltersSchema } from '../validation/schemas';
import { parseWithSchema } from '../validation/parser';
// Import Utils
import { appEvents } from '../utils/events';
import { getRealtimePingIntervalMs, onRequest, toConnectError } from '../utils/socket';

/* -------------------------------------- Config -------------------------------------- */

// Config namespace ของ Kiosk, Barrier Gate และ Mobile
const CLIENT_NAMESPACE = '/client';

// Config ประเภทอุปกรณ์ที่เชื่อมต่อด้วย device credentials ได้ (ไม่ส่ง deviceId = mobile)
const CLIENT_DEVICE_TYPES = ['kiosk', 'barrier_gate'];

// Config device_event ที่ทำให้ token เดิมของอุปกรณ์ใช้ไม่ได้ ต้องตัด connection ของอุปกรณ์ทันที
const DEVICE_REVOKED_EVENTS = new Set<string>(['device_deleted', 'device_activation_reissued']);

// Config reason ตอนตรวจซ้ำที่ token ยังถูกต้อง (อุปกรณ์ถูกปิดใช้งาน หรือ IP ไม่อยู่ใน allowedIps)
// ตัด connection โดยไม่ส่ง device:revoked อุปกรณ์จะต่อใหม่แล้วได้ connect_error INVALID_DEVICE_CREDENTIALS reason เดียวกัน ไปหน้า Maintenance และเก็บ token ไว้
const DEVICE_SUSPENDED_REASONS = new Set<string>(['inactive', 'ip_not_allowed']);

// Config room ของ socket
const ROOMS = {
  devices: 'devices',
  device: (deviceId: string) => `device:${deviceId}`,
  charge: (chargeId: string) => `payments:charge:${chargeId}`,
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function อ่านค่า string จาก handshake auth (ค่าอื่นถือว่าไม่ได้ส่ง)
function readAuthText(auth: Record<string, unknown> | undefined, key: string): string | null {
  const value = auth?.[key];
  return typeof value === 'string' && value ? value : null;
}

// Function ส่งเหตุผลให้อุปกรณ์แล้วตัด connection เมื่อ token ถูกยกเลิกหรืออุปกรณ์ถูกลบ (อุปกรณ์ต้อง activate ใหม่)
function revokeDevice(socket: ClientSocket, reason: string): void {
  socket.emit('device:revoked', { reason, at: new Date().toISOString() });
  socket.disconnect(true);
}

// Function ตรวจ device token และ allowedIps ซ้ำ แล้ว refresh heartbeat เพื่อให้อุปกรณ์ online ตลอดที่เปิดหน้าจออยู่
async function recheckDevice(socket: ClientSocket): Promise<void> {
  const { deviceId, deviceToken, ip } = socket.data;
  if (!deviceId) return;
  const result = await clientService.refreshDeviceHeartbeat(deviceId, deviceToken, ip);
  if (result.ok) return;
  if (DEVICE_SUSPENDED_REASONS.has(result.reason)) socket.disconnect(true);
  else revokeDevice(socket, result.reason);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง namespace /client: ส่ง auth { deviceId, deviceToken } = kiosk/barrier gate (ตรวจแบบเดียวกับ HTTP device auth) ไม่ส่ง = mobile
// ทุก client ได้ theme:updated และ payment_settings:updated, อุปกรณ์ได้ lpr:detected ตามตัวกรอง gateId/direction/cameraId ใน auth
function attachClientNamespace(io: Server, getIp: SocketIpResolver): () => void {
  const namespace = io.of(CLIENT_NAMESPACE);
  const sockets = (): ClientSocket[] => [...namespace.sockets.values()] as ClientSocket[];

  namespace.use(async (socket, next) => {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    const deviceId = readAuthText(auth, 'deviceId');
    const deviceToken = readAuthText(auth, 'deviceToken');
    const ip = getIp(socket.request);
    socket.data = { ip, clientType: 'public', deviceId: null, deviceToken: null, filters: lprFiltersSchema.parse(auth ?? {}) } satisfies ClientSocketData;
    if (!deviceId) return next();

    try {
      const device = await deviceAuthService.authenticateDevice({ deviceId, deviceToken, ip, allowedTypes: CLIENT_DEVICE_TYPES });
      const { clientType } = await clientService.startClientEventSession(deviceId, { device, ip });
      Object.assign(socket.data, { clientType, deviceId: device.deviceId || deviceId, deviceToken });
      return next();
    } catch (err) {
      return next(toConnectError(err));
    }
  });

  namespace.on('connection', (socket: ClientSocket) => {
    if (socket.data.deviceId) {
      socket.join([ROOMS.devices, ROOMS.device(socket.data.deviceId)]);
    }
    socket.emit('ready', { clientType: socket.data.clientType, heartbeatIntervalMs: getRealtimePingIntervalMs() });

    // payments: ติดตามสถานะ payment ของ chargeId เดียว (subscribe ใหม่แทนของเดิม) ack ส่งสถานะล่าสุดถ้ามีผลแล้ว
    onRequest(socket, 'payments:subscribe', async (payload) => {
      const { chargeId } = parseWithSchema(clientPaymentSubscribeSchema, payload);
      [...socket.rooms].filter((room) => room.startsWith('payments:')).forEach((room) => socket.leave(room));
      socket.join(ROOMS.charge(chargeId));
      return paymentRealtimeService.buildPaymentUpdateSnapshot(chargeId);
    });
    onRequest(socket, 'payments:unsubscribe', async () => {
      [...socket.rooms].filter((room) => room.startsWith('payments:')).forEach((room) => socket.leave(room));
      return null;
    });
  });

  const onThemeUpdated = (theme: unknown): void => void namespace.emit('theme:updated', { theme });
  const onPaymentSettingsUpdated = (event: unknown): void => void namespace.emit('payment_settings:updated', event);
  const onPaymentUpdated = (event: PaymentUpdateEvent): void => {
    if (event.chargeId) namespace.to(ROOMS.charge(event.chargeId)).emit('payments:updated', event);
  };
  // lpr_detected ส่งเฉพาะอุปกรณ์ที่ตัวกรองตรง (ไม่ส่งตัวกรอง = รับทุก event)
  const onLprDetected = (event: { gateId?: string | null; direction?: string; cameraId?: string }): void => {
    sockets().filter((socket) => socket.data.deviceId).forEach((socket) => {
      const { gateId, direction, cameraId } = socket.data.filters;
      if (gateId && event.gateId !== gateId) return;
      if (direction && event.direction !== direction) return;
      if (cameraId && event.cameraId !== cameraId) return;
      socket.emit('lpr:detected', event);
    });
  };
  const onDeviceEvent = (event: DeviceEvent): void => {
    if (!event.deviceId || !DEVICE_REVOKED_EVENTS.has(event.type)) return;
    sockets().filter((socket) => socket.data.deviceId === event.deviceId).forEach((socket) => revokeDevice(socket, event.type));
  };

  // ตรวจ token/allowedIps ของอุปกรณ์ซ้ำและ refresh heartbeat ทุก REALTIME_PING_INTERVAL_MS
  const interval = setInterval(() => {
    sockets().filter((socket) => socket.data.deviceId).forEach((socket) => void recheckDevice(socket));
  }, getRealtimePingIntervalMs());
  interval.unref?.();

  const listeners: [string, (payload: never) => void][] = [
    ['theme_updated', onThemeUpdated],
    ['payment_settings_updated', onPaymentSettingsUpdated],
    ['payment_updated', onPaymentUpdated],
    ['lpr_detected', onLprDetected],
    ['device_event', onDeviceEvent],
  ];
  listeners.forEach(([event, listener]) => appEvents.on(event, listener as (...args: unknown[]) => void));

  // Function เลิกฟัง app event และหยุดตรวจอุปกรณ์ (เรียกตอนปิด Socket.IO)
  return () => {
    clearInterval(interval);
    listeners.forEach(([event, listener]) => appEvents.off(event, listener as (...args: unknown[]) => void));
  };
}

export { attachClientNamespace };
