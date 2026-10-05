// Import Library
import type { Request, Response } from 'express';
// Import Services
import * as authService from '../services/auth.service';
import * as clientService from '../services/client.service';
import * as dashboardService from '../services/dashboard.service';
import * as devicesService from '../services/devices.service';
import * as overviewService from '../services/overview.service';
import * as paymentsService from '../services/payments.service';
import * as transactionsService from '../services/transactions.service';
// Import Types
import type { OverviewQuery } from '../types/overview.type';
import type { DeviceEvent } from '../types/shared/device.type';
import type { DashboardUpdatedEvent, ForwardStreamOptions, RefreshStreamOptions, SessionRevokedEvent, SseStream, SseStreamOptions } from '../types/shared/realtime.type';
import type { TransactionListQuery } from '../types/transactions.type';
// Import Utils
import { getBangkokParts } from '../utils/date';
import { appEvents } from '../utils/events';

/* -------------------------------------- Config -------------------------------------- */

// Config device_event ที่ทำให้ token เดิมของอุปกรณ์ใช้ไม่ได้ ต้องปิด stream ของ client ทันที
const DEVICE_REVOKED_EVENTS = new Set<string>(['device_deleted', 'device_activation_reissued']);

/* -------------------------------------- Stream Helpers -------------------------------------- */

// Function อ่านระยะเวลา ping ของ SSE และ WebSocket จาก REALTIME_PING_INTERVAL_MS ถ้าไม่ได้ตั้งหรือค่าผิดให้ throw
function getRealtimePingIntervalMs(): number {
  const raw = process.env.REALTIME_PING_INTERVAL_MS;
  if (!raw) throw new Error('REALTIME_PING_INTERVAL_MS is required');

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error('REALTIME_PING_INTERVAL_MS must be a positive integer (milliseconds)');
  return value;
}

// Function สร้าง SSE stream ที่ส่ง ping ตาม REALTIME_PING_INTERVAL_MS (เรียก onPing ก่อนส่งทุกครั้ง) พร้อม cleanup helper
function createSseStream(req: Request, res: Response, { connected, onPing }: SseStreamOptions = {}): SseStream {
  const pingIntervalMs = getRealtimePingIntervalMs();
  let closed = false;
  const cleanups: (() => void)[] = [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // ปิด buffering ของ nginx เพื่อให้ event ถึง client ทันที
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // เขียน payload ลง SSE stream
  const write = (payload: unknown): void => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // เพิ่ม cleanup callback ตอน connection ปิด
  const addCleanup = (cleanup: () => void): void => {
    if (typeof cleanup === 'function') cleanups.push(cleanup);
  };

  // เพิ่ม interval และผูก cleanup อัตโนมัติ
  const addInterval = (callback: () => void | Promise<void>, intervalMs: number): NodeJS.Timeout => {
    const interval = setInterval(callback, intervalMs);
    cleanups.push(() => clearInterval(interval));
    return interval;
  };

  // รัน cleanup ทั้งหมดครั้งเดียวตอน stream ปิด
  const runCleanups = (): void => {
    closed = true;
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) cleanup();
    }
  };

  // ปิด stream จากฝั่ง server (เช่น session ถูก revoke)
  const close = (): void => {
    if (closed) return;
    runCleanups();
    res.end();
  };

  // ส่งรอบ ping ไปกับ connected ให้ client ตั้งเวลาตัด connection ที่เงียบเกินได้ตรงกับ server
  if (connected) write({ ...connected, pingIntervalMs });
  addInterval(() => {
    if (onPing) void onPing();
    write({ type: 'ping', at: new Date().toISOString() });
  }, pingIntervalMs);

  req.on('close', runCleanups);

  return {
    write,
    addCleanup,
    addInterval,
    close,
    isClosed: () => closed,
  };
}

// Function คิวงาน refresh ไม่ให้รันซ้อนกัน ถ้ามีงานเข้ามาระหว่างรันจะรันซ้ำอีกรอบด้วย args ล่าสุด
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

// Function ฟัง app event ตลอดอายุ stream และเลิกฟังอัตโนมัติเมื่อ stream ปิด
function listen<T>(stream: SseStream, event: string, handler: (payload: T) => void): void {
  appEvents.on(event, handler);
  stream.addCleanup(() => appEvents.off(event, handler));
}

// Function ส่ง payload เดิมต่อให้ client โดยไม่แปลง
function asIs(payload: unknown): unknown {
  return payload;
}

// Function สร้าง key วันที่ปัจจุบันตามเวลา Bangkok ใช้เช็คการข้ามวัน
function getBangkokDateKey(): string {
  const { year, month, day } = getBangkokParts(new Date());
  return `${year}-${month}-${day}`;
}

/* -------------------------------------- Admin Stream Helpers -------------------------------------- */

// Function ผูก SSE ของ Admin กับ session: ส่ง session_revoked แล้วปิด stream เมื่อ logout, session หมดอายุ หรือ user ถูกระงับ/ลบ
function watchAdminSession(req: Request, stream: SseStream): void {
  const { sessionId } = req;
  const userId = req.user?.id;
  if (!sessionId || !userId) return;

  // ส่งเหตุผลให้ frontend แล้วปิด stream
  const end = (reason: string): void => {
    if (stream.isClosed()) return;
    stream.write({ type: 'session_revoked', reason, at: new Date().toISOString() });
    stream.close();
  };

  listen(stream, 'session_revoked', (event: SessionRevokedEvent) => {
    const matched = event.sessionId ? event.sessionId === sessionId : event.userId === userId;
    if (matched) end(event.reason);
  });

  // ตรวจซ้ำตามรอบ ping เพื่อจับ session ที่หมดอายุเอง หรือถูก revoke จาก instance อื่น
  stream.addInterval(async () => {
    try {
      const reason = await authService.getSessionEndReasonById(sessionId, userId);
      if (reason) end(reason);
    } catch (err) {
      console.error('Admin SSE session check failed:', err);
    }
  }, getRealtimePingIntervalMs());
}

// Function เปิด Admin SSE ที่ส่งข้อมูลชุดใหม่ทุกครั้งที่ transaction/payment เปลี่ยน (dashboard, overview, transactions) ไม่มี polling
// ส่ง <name>_snapshot ตอนเชื่อมต่อ, <name>_updated เมื่อได้ dashboard_updated และ <name>_error เมื่อโหลดไม่สำเร็จ
async function openRefreshStream<T>(req: Request, res: Response, { name, connectedMessage, errorMessage, load, preload = false, refreshOnDayChange = false }: RefreshStreamOptions<T>): Promise<void> {
  // preload ก่อนเปิด stream เพื่อตอบ error เป็น JSON ปกติได้ (เช่นช่วงวันที่ผิดตอบ 400)
  const initialData = preload ? await load() : null;
  let dateKey = getBangkokDateKey();
  const stream = createSseStream(req, res, {
    connected: { type: 'connected', message: connectedMessage },
    // ข้ามวันตามเวลาไทยให้ส่งข้อมูลของวันใหม่ตอน ping แรกหลังเที่ยงคืน
    onPing: refreshOnDayChange
      ? () => {
        const todayKey = getBangkokDateKey();
        if (todayKey === dateKey) return;
        dateKey = todayKey;
        void send(`${name}_updated`, { reason: 'day_changed', transactionId: null, plateNo: null, at: new Date().toISOString() });
      }
      : undefined,
  });

  watchAdminSession(req, stream);

  const send = createQueuedTask(async (type: string, trigger: DashboardUpdatedEvent | null = null, preloaded: T | null = null) => {
    if (stream.isClosed()) return;
    try {
      stream.write({ type, trigger, data: preloaded ?? await load(), generatedAt: new Date().toISOString() });
    } catch (err) {
      stream.write({ type: `${name}_error`, message: (err instanceof Error && err.message) || errorMessage, generatedAt: new Date().toISOString() });
    }
  });

  await send(`${name}_snapshot`, null, initialData);
  listen(stream, 'dashboard_updated', (event: DashboardUpdatedEvent) => void send(`${name}_updated`, event));
}

// Function เปิด Admin SSE ที่ส่ง snapshot ตอนเชื่อมต่อ แล้วส่งต่อ app event ตามที่กำหนด (devices, refunds) ไม่มี polling
async function openForwardStream<T>(req: Request, res: Response, { connectedMessage, loadSnapshot, toSnapshotEvent, events }: ForwardStreamOptions<T>): Promise<void> {
  // ดึง snapshot ก่อนเปิด stream เพื่อตอบ error เป็น JSON ปกติได้ถ้า database มีปัญหา
  const snapshot = await loadSnapshot();
  const stream = createSseStream(req, res, {
    connected: { type: 'connected', message: connectedMessage },
  });

  watchAdminSession(req, stream);
  stream.write({ ...toSnapshotEvent(snapshot), generatedAt: new Date().toISOString() });
  Object.entries(events).forEach(([event, toPayload]) => listen(stream, event, (payload: unknown) => stream.write(toPayload(payload))));
}

/* -------------------------------------- Client Stream -------------------------------------- */

// Function เปิด SSE ของ client ส่ง theme_updated/payment_settings_updated ให้ทุกคน และ lpr_detected เฉพาะอุปกรณ์ที่ยืนยันตัวตน
async function openClientEventStream(req: Request, res: Response): Promise<void> {
  const { deviceId, gateId, direction, cameraId } = req.query as Record<string, string | undefined>;
  const normalizedDirection = direction ? String(direction).trim().toUpperCase() : null;
  const normalizedCameraId = cameraId ? String(cameraId).trim() : null;
  const { clientType } = await clientService.startClientEventSession(deviceId, { device: req.device, ip: req.ip });
  const isDevice = clientType !== 'public';

  // ส่งเหตุผลให้อุปกรณ์แล้วปิด stream เมื่อ token ถูกยกเลิกหรืออุปกรณ์ถูกลบ
  const revoke = (reason: string): void => {
    if (stream.isClosed()) return;
    stream.write({ type: 'device_revoked', reason, at: new Date().toISOString() });
    stream.close();
  };

  const stream = createSseStream(req, res, {
    connected: { type: 'connected', clientType, message: 'Client event stream connected' },
    // ping ของ kiosk/barrier gate ตรวจ token ซ้ำและ refresh heartbeat เพื่อให้อุปกรณ์ online ตลอดที่เปิดหน้าจออยู่
    onPing: async () => {
      if (!isDevice) return;
      const result = await clientService.refreshDeviceHeartbeat(req.deviceId ?? '', req.deviceToken, req.ip);
      if (!result.ok) revoke(result.reason);
    },
  });

  listen(stream, 'theme_updated', (theme: unknown) => stream.write({ type: 'theme_updated', theme }));
  listen(stream, 'payment_settings_updated', (event: unknown) => stream.write(event));
  if (!isDevice) return;

  // lpr_detected กรองตาม gateId/direction/cameraId ที่หน้าจอส่งมา
  listen(stream, 'lpr_detected', (event: { gateId?: string | null; direction?: string; cameraId?: string }) => {
    if (gateId && event.gateId !== gateId) return;
    if (normalizedDirection && event.direction !== normalizedDirection) return;
    if (normalizedCameraId && event.cameraId !== normalizedCameraId) return;
    stream.write(event);
  });
  listen(stream, 'device_event', (event: DeviceEvent) => {
    if (event.deviceId === req.deviceId && DEVICE_REVOKED_EVENTS.has(event.type)) revoke(event.type);
  });
}

/* -------------------------------------- Admin Streams -------------------------------------- */

// Function เปิด SSE ของ dashboard ส่ง summary ใหม่เมื่อ transaction/payment เปลี่ยน หรือเมื่อข้ามวัน (เช็คตอน ping)
async function openDashboardEventStream(req: Request, res: Response): Promise<void> {
  await openRefreshStream(req, res, {
    name: 'dashboard',
    connectedMessage: 'Dashboard event stream connected',
    errorMessage: 'Unable to refresh dashboard summary',
    load: () => dashboardService.getDashboardSummary(),
    refreshOnDayChange: true,
  });
}

// Function เปิด SSE ของ overview ส่งข้อมูลช่วงวันที่ตาม query ใหม่เมื่อ transaction/payment เปลี่ยน
async function openOverviewEventStream(req: Request, res: Response): Promise<void> {
  const query = req.query as OverviewQuery;
  await openRefreshStream(req, res, {
    name: 'overview',
    connectedMessage: 'Overview event stream connected',
    errorMessage: 'Unable to refresh overview summary',
    load: () => overviewService.getOverviewSummary(query),
    preload: true,
  });
}

// Function เปิด SSE ของรายการ transaction ส่งรายการตาม query ใหม่เมื่อ transaction/payment เปลี่ยน
async function openTransactionEventStream(req: Request, res: Response): Promise<void> {
  await openRefreshStream(req, res, {
    name: 'transactions',
    connectedMessage: 'Transactions event stream connected',
    errorMessage: 'Unable to refresh transactions list',
    load: () => transactionsService.listTransactions(req.query as TransactionListQuery),
  });
}

// Function เปิด SSE ของอุปกรณ์ ส่ง devices_snapshot แล้วส่ง device event และ devices config ที่เปลี่ยน
async function openDeviceEventStream(req: Request, res: Response): Promise<void> {
  await openForwardStream(req, res, {
    connectedMessage: 'Device event stream connected',
    loadSnapshot: () => devicesService.listDevices(),
    toSnapshotEvent: (data) => ({ type: 'devices_snapshot', data }),
    events: {
      device_event: asIs,
      devices_config_updated: (config) => ({ type: 'devices_config_updated', config }),
    },
  });
}

// Function เปิด SSE รายการรอคืนเงิน ส่ง refunds_snapshot แล้วส่ง refund_required/refund_resolved และ payment_settings_updated
async function openRefundEventStream(req: Request, res: Response): Promise<void> {
  await openForwardStream(req, res, {
    connectedMessage: 'Refund event stream connected',
    loadSnapshot: () => paymentsService.getPendingRefundsSnapshot(),
    toSnapshotEvent: (snapshot) => ({ type: 'refunds_snapshot', ...snapshot }),
    events: { refund_event: asIs, payment_settings_updated: asIs },
  });
}

export { createQueuedTask, getRealtimePingIntervalMs, openClientEventStream, openDashboardEventStream, openDeviceEventStream, openOverviewEventStream, openRefundEventStream, openTransactionEventStream };
