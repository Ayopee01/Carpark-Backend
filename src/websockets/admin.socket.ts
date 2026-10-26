// Import Library
import type { Server } from 'socket.io';
// Import Services
import * as authService from '../services/auth.service';
import * as dashboardService from '../services/dashboard.service';
import * as devicesService from '../services/devices.service';
import * as overviewService from '../services/overview.service';
import * as paymentRealtimeService from '../services/shared/payment-realtime.service';
import * as transactionsService from '../services/transactions.service';
// Import Types
import type { OverviewQuery } from '../types/overview.type';
import type { PaymentUpdateEvent } from '../types/shared/payment.type';
import type { AdminSocket, AdminSocketData, AdminStream, DashboardUpdatedEvent, SessionRevokedEvent } from '../types/shared/realtime.type';
import type { Permission } from '../types/shared/user.type';
import type { TransactionListQuery } from '../types/transactions.type';
// Import Validation
import { adminPaymentSubscribeSchema, streamQuerySchema } from '../validation/schemas';
import { parseWithSchema } from '../validation/parser';
// Import Utils
import { ApiError } from '../utils/api-error';
import { formatBangkok } from '../utils/date';
import { appEvents } from '../utils/events';
import { logger } from '../utils/logger';
import { getRealtimePingIntervalMs, onRequest, toConnectError } from '../utils/socket';
import { normalizePlateNo } from '../utils/vehicle';

/* -------------------------------------- Config -------------------------------------- */

// Config namespace ของ Admin Frontend
const ADMIN_NAMESPACE = '/admin';

// Config permission ที่ subscribe แต่ละ stream ได้ (มีอย่างใดอย่างหนึ่งก็ผ่าน)
const STREAM_PERMISSIONS: Record<AdminStream, Permission[]> = {
  dashboard: ['dashboard', 'transactions'],
  overview: ['overview'],
  transactions: ['transactions'],
  devices: ['devices'],
  payments: ['transactions'],
};

// Config room ของ event ที่ส่งต่อตรง ๆ (refund, payment settings และแจ้งเตือน IP อุปกรณ์ ส่งเฉพาะผู้ที่มีสิทธิ์ transactions ที่ subscribe dashboard)
const ROOMS = {
  dashboardAlerts: 'dashboard:alerts',
  devices: 'devices',
  charge: (chargeId: string) => `payments:charge:${chargeId}`,
  plate: (plateNo: string) => `payments:plate:${plateNo}`,
};

// Config app event ที่ส่งต่อให้ room dashboard:alerts (key = app event, value = ชื่อ event ของ Socket.IO)
const DASHBOARD_ALERT_EVENTS: Record<string, string> = {
  refund_event: 'refunds:event',
  payment_settings_updated: 'payment_settings:updated',
  device_alert: 'device_alerts:event',
};

/* -------------------------------------- Helpers -------------------------------------- */

// Function คิวงานไม่ให้รันซ้อนกัน ถ้ามีงานเข้ามาระหว่างรันจะรันซ้ำอีกรอบด้วย args ล่าสุด
function createQueuedTask<TArgs extends unknown[]>(task: (...args: TArgs) => Promise<void>): (...args: TArgs) => Promise<void> {
  let running = false;
  let pendingArgs: TArgs | null = null;

  const run = async (...args: TArgs): Promise<void> => {
    if (running) {
      pendingArgs = args;
      return;
    }

    running = true;
    try {
      await task(...args);
    } finally {
      running = false;
      if (pendingArgs) {
        const nextArgs: TArgs = pendingArgs;
        pendingArgs = null;
        await run(...nextArgs);
      }
    }
  };

  return run;
}

// Function ตรวจว่า socket มี permission ของ stream
function canSubscribe(socket: AdminSocket, stream: AdminStream): boolean {
  return STREAM_PERMISSIONS[stream].some((permission) => socket.data.permissions.includes(permission));
}

// Function บังคับ permission ของ stream ก่อน subscribe (ไม่มีสิทธิ์ = FORBIDDEN เหมือน HTTP 403)
function assertCanSubscribe(socket: AdminSocket, stream: AdminStream): void {
  if (!canSubscribe(socket, stream)) throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
}

// Function สร้าง refresh ของ stream ที่โหลดข้อมูลใหม่แล้วส่ง <stream>:updated (โหลดไม่สำเร็จส่ง <stream>:error) และไม่รันซ้อนกัน
function createStreamRefresh(socket: AdminSocket, stream: AdminStream, load: () => Promise<unknown>): (trigger: DashboardUpdatedEvent) => void {
  const refresh = createQueuedTask(async (trigger: DashboardUpdatedEvent) => {
    if (!socket.connected || !socket.data.streams.has(stream)) return;
    try {
      socket.emit(`${stream}:updated`, { trigger, data: await load(), generatedAt: new Date().toISOString() });
    } catch (err) {
      socket.emit(`${stream}:error`, { message: err instanceof Error ? err.message : 'Unable to refresh data', generatedAt: new Date().toISOString() });
    }
  });
  return (trigger) => void refresh(trigger);
}

// Function subscribe stream ที่โหลดข้อมูลใหม่ทุกครั้งที่ transaction/payment เปลี่ยน: ack ส่ง snapshot แรก (โหลดไม่ผ่าน = ack error และไม่ subscribe)
async function subscribeRefreshStream(socket: AdminSocket, stream: AdminStream, load: () => Promise<unknown>): Promise<unknown> {
  assertCanSubscribe(socket, stream);
  const snapshot = await load();
  socket.data.streams.set(stream, createStreamRefresh(socket, stream, load));
  return snapshot;
}

// Function ส่งเหตุผลที่ session ใช้ต่อไม่ได้แล้วตัด connection (client ต้อง login ใหม่ ไม่ reconnect เอง)
function endSession(socket: AdminSocket, reason: string): void {
  socket.emit('session:revoked', { reason, at: new Date().toISOString() });
  socket.disconnect(true);
}

// Function ตรวจ session และ permission ล่าสุดของ socket: session จบแล้วตัด connection, permission ที่ถูกถอดเลิกส่ง stream นั้น
async function recheckSession(socket: AdminSocket): Promise<void> {
  try {
    const { reason, permissions } = await authService.getSessionState(socket.data.sessionId, socket.data.userId);
    if (reason) return endSession(socket, reason);

    socket.data.permissions = permissions;
    for (const stream of [...socket.data.streams.keys()]) {
      if (canSubscribe(socket, stream)) continue;
      unsubscribe(socket, stream);
      socket.emit('stream:forbidden', { stream });
    }
    if (!permissions.includes('transactions')) socket.leave(ROOMS.dashboardAlerts);
  } catch (err) {
    logger.error({ err }, 'Admin realtime session check failed');
  }
}

// Function เลิก subscribe stream และออกจาก room ของ stream นั้น
function unsubscribe(socket: AdminSocket, stream: AdminStream): void {
  socket.data.streams.delete(stream);
  if (stream === 'dashboard') socket.leave(ROOMS.dashboardAlerts);
  if (stream === 'devices') socket.leave(ROOMS.devices);
  if (stream === 'payments') [...socket.rooms].filter((room) => room.startsWith('payments:')).forEach((room) => socket.leave(room));
}

/* -------------------------------------- Stream Handlers -------------------------------------- */

// Function ผูก event subscribe/unsubscribe ของทุก stream กับ socket (ตอบผลทาง ack)
function registerStreamHandlers(socket: AdminSocket): void {
  // dashboard: สถิติส่งเฉพาะผู้มีสิทธิ์ dashboard ส่วน refunds และแจ้งเตือนส่งเฉพาะผู้มีสิทธิ์ transactions
  onRequest(socket, 'dashboard:subscribe', async () => {
    const canViewDashboard = socket.data.permissions.includes('dashboard');
    const canViewRefunds = socket.data.permissions.includes('transactions');
    const snapshot = await subscribeRefreshStream(socket, 'dashboard', canViewDashboard
      ? () => dashboardService.getDashboardSummary({ includeRefunds: canViewRefunds })
      : () => dashboardService.getDashboardRefunds());
    if (canViewRefunds) socket.join(ROOMS.dashboardAlerts);
    return snapshot;
  });

  // overview: ช่วงวันที่ตาม query (ช่วงผิดตอบ ack error INVALID_DATE_RANGE) ไม่ส่ง terminals[].payments ของกระทบยอด EDC
  onRequest(socket, 'overview:subscribe', (payload) => {
    const query = parseWithSchema(streamQuerySchema, payload) as OverviewQuery;
    const includeTransactions = socket.data.permissions.includes('transactions');
    return subscribeRefreshStream(socket, 'overview', () => overviewService.getOverviewSummary(query, { includeTransactions, includeEdcPayments: false }));
  });

  // transactions: รายการตาม query ของหน้ารายการ
  onRequest(socket, 'transactions:subscribe', (payload) => {
    const query = parseWithSchema(streamQuerySchema, payload) as TransactionListQuery;
    return subscribeRefreshStream(socket, 'transactions', () => transactionsService.listTransactions(query));
  });

  // devices: snapshot รายการอุปกรณ์ แล้วส่ง devices:event และ devices:config_updated
  onRequest(socket, 'devices:subscribe', async () => {
    assertCanSubscribe(socket, 'devices');
    const snapshot = await devicesService.listDevices();
    socket.data.streams.set('devices', () => undefined);
    socket.join(ROOMS.devices);
    return snapshot;
  });

  // payments: ติดตามสถานะ payment ของ chargeId หรือทะเบียน (subscribe ใหม่แทนของเดิม) ack ส่งสถานะล่าสุดของ chargeId ถ้ามีผลแล้ว
  onRequest(socket, 'payments:subscribe', async (payload) => {
    assertCanSubscribe(socket, 'payments');
    const { chargeId, plateNo } = parseWithSchema(adminPaymentSubscribeSchema, payload);
    unsubscribe(socket, 'payments');
    socket.data.streams.set('payments', () => undefined);
    if (chargeId) socket.join(ROOMS.charge(chargeId));
    const normalizedPlateNo = plateNo ? normalizePlateNo(plateNo) : null;
    if (normalizedPlateNo) socket.join(ROOMS.plate(normalizedPlateNo));
    return chargeId ? paymentRealtimeService.buildPaymentUpdateSnapshot(chargeId) : null;
  });

  (Object.keys(STREAM_PERMISSIONS) as AdminStream[]).forEach((stream) => {
    onRequest(socket, `${stream}:unsubscribe`, async () => {
      unsubscribe(socket, stream);
      return null;
    });
  });
}

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง namespace /admin: handshake ด้วย access token ใน auth.token
// session ที่จบแล้ว (logout, revoke, user ถูกระงับ/ลบ) ถูกตัดทันทีจาก session_revoked และตรวจซ้ำทุก REALTIME_PING_INTERVAL_MS
function attachAdminNamespace(io: Server): () => void {
  const namespace = io.of(ADMIN_NAMESPACE);
  const sockets = (): AdminSocket[] => [...namespace.sockets.values()] as AdminSocket[];

  namespace.use(async (socket, next) => {
    const authToken: unknown = socket.handshake.auth?.token;
    const token = typeof authToken === 'string' && authToken ? authToken : null;
    try {
      const { user, sessionId } = await authService.authenticateAccessToken(token);
      socket.data = { userId: user.id, sessionId, permissions: (user.permissions || []) as Permission[], streams: new Map() } satisfies AdminSocketData;
      return next();
    } catch (err) {
      if (!(err instanceof ApiError && err.statusCode === 401)) return next(toConnectError(err, 'internal_error'));
      // invalid_token = token ผิดหรือหมดอายุ (refresh แล้วต่อใหม่ได้) ค่าอื่นคือ session จบแล้วต้อง login ใหม่
      const reason = await authService.getAccessTokenEndReason(token).catch(() => 'invalid_token');
      return next(toConnectError(err, reason));
    }
  });

  namespace.on('connection', (socket: AdminSocket) => registerStreamHandlers(socket));

  // transaction/payment เปลี่ยน: โหลดข้อมูลใหม่ให้ทุก stream ที่ subscribe อยู่
  const onDashboardUpdated = (event: DashboardUpdatedEvent): void => {
    sockets().forEach((socket) => (['dashboard', 'overview', 'transactions'] as AdminStream[]).forEach((stream) => socket.data.streams.get(stream)?.(event)));
  };
  const onPaymentUpdated = (event: PaymentUpdateEvent): void => {
    const rooms = [event.chargeId ? ROOMS.charge(event.chargeId) : null, event.plateNo ? ROOMS.plate(normalizePlateNo(event.plateNo) ?? '') : null].filter((room): room is string => Boolean(room));
    if (rooms.length) namespace.to(rooms).emit('payments:updated', event);
  };
  const onSessionRevoked = (event: SessionRevokedEvent): void => {
    sockets().forEach((socket) => {
      const matched = event.sessionId ? event.sessionId === socket.data.sessionId : event.userId === socket.data.userId;
      if (matched) endSession(socket, event.reason);
    });
  };
  // refund, payment settings และแจ้งเตือน IP อุปกรณ์ ส่งต่อ payload เดิมให้ผู้มีสิทธิ์ transactions ที่ subscribe dashboard
  const forwardListeners = Object.entries(DASHBOARD_ALERT_EVENTS).map(([appEvent, socketEvent]) => [appEvent, (payload: unknown) => namespace.to(ROOMS.dashboardAlerts).emit(socketEvent, payload)] as const);
  const onDeviceEvent = (event: unknown): void => void namespace.to(ROOMS.devices).emit('devices:event', event);
  const onDevicesConfigUpdated = (config: unknown): void => void namespace.to(ROOMS.devices).emit('devices:config_updated', { config });

  appEvents.on('dashboard_updated', onDashboardUpdated);
  appEvents.on('payment_updated', onPaymentUpdated);
  appEvents.on('session_revoked', onSessionRevoked);
  appEvents.on('device_event', onDeviceEvent);
  appEvents.on('devices_config_updated', onDevicesConfigUpdated);
  forwardListeners.forEach(([appEvent, listener]) => appEvents.on(appEvent, listener));

  // ตรวจ session ซ้ำเป็นระยะ (session หมดอายุเอง, revoke จาก instance อื่น, permission ถูกถอด) และส่ง dashboard ของวันใหม่เมื่อข้ามเที่ยงคืนเวลาไทย
  let dateKey = formatBangkok(new Date(), 'yyyy-MM-dd');
  const interval = setInterval(() => {
    sockets().forEach((socket) => void recheckSession(socket));
    const todayKey = formatBangkok(new Date(), 'yyyy-MM-dd');
    if (todayKey === dateKey) return;
    dateKey = todayKey;
    const trigger: DashboardUpdatedEvent = { reason: 'day_changed', transactionId: null, plateNo: null, at: new Date().toISOString() };
    sockets().filter((socket) => socket.data.permissions.includes('dashboard')).forEach((socket) => socket.data.streams.get('dashboard')?.(trigger));
  }, getRealtimePingIntervalMs());
  interval.unref?.();

  // Function เลิกฟัง app event และหยุดตรวจ session (เรียกตอนปิด Socket.IO)
  return () => {
    clearInterval(interval);
    appEvents.off('dashboard_updated', onDashboardUpdated);
    appEvents.off('payment_updated', onPaymentUpdated);
    appEvents.off('session_revoked', onSessionRevoked);
    appEvents.off('device_event', onDeviceEvent);
    appEvents.off('devices_config_updated', onDevicesConfigUpdated);
    forwardListeners.forEach(([appEvent, listener]) => appEvents.off(appEvent, listener));
  };
}

export { attachAdminNamespace, createQueuedTask };
