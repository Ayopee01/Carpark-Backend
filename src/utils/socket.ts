// Import Types
import type { RealtimeConnectError, SocketAck, SocketAckResponse } from '../types/shared/realtime.type';
// Import Utils
import { ApiError } from './api-error';
import { logger } from './logger';

/* -------------------------------------- Helpers -------------------------------------- */

// Function ส่งผลกลับทาง ack ถ้า client ส่ง callback มา (client ที่ไม่รอ ack ไม่ทำให้ server error)
function reply(ack: unknown, response: SocketAckResponse): void {
  if (typeof ack === 'function') (ack as SocketAck)(response);
}

// Function รัน handler ของ event ที่ client ส่งมา แล้วตอบ ack { ok: true, data } หรือ { ok: false, error } ด้วย code/message เดียวกับ HTTP
async function handleWithAck(ack: unknown, handler: () => Promise<unknown>): Promise<void> {
  try {
    reply(ack, { ok: true, data: await handler() });
  } catch (err) {
    if (!(err instanceof ApiError)) logger.error({ err }, 'Realtime event failed');
    const apiError = err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
    reply(ack, { ok: false, error: { code: apiError.code, message: apiError.message, details: apiError.details } });
  }
}

/* -------------------------------------- Functions -------------------------------------- */

// Function อ่านระยะเวลา heartbeat ของ Socket.IO และรอบตรวจ session/อุปกรณ์ซ้ำ จาก REALTIME_PING_INTERVAL_MS
function getRealtimePingIntervalMs(): number {
  return Number(process.env.REALTIME_PING_INTERVAL_MS);
}

// Function แปลง error เป็น connect_error ของ Socket.IO (message = code ที่ client ใช้แยกกรณี, data = statusCode/code/reason ชุดเดียวกับ HTTP)
// error ที่ไม่ใช่ ApiError คือ server ขัดข้อง (log ไว้ และไม่ส่งรายละเอียดออกไป)
function toConnectError(err: unknown, reason?: string): RealtimeConnectError {
  if (!(err instanceof ApiError)) logger.error({ err }, 'Realtime handshake failed');
  const apiError = err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  const error = new Error(apiError.code || apiError.message) as RealtimeConnectError;
  error.data = { statusCode: apiError.statusCode, code: apiError.code, reason: reason ?? (apiError.details.reason as string | undefined), details: apiError.details };
  return error;
}

// Function ผูก event ที่ client ส่งมาแบบ request/ack: socket.emit(event, payload?, ack) payload ไม่ส่งก็ได้ (ack เป็น argument สุดท้าย)
function onRequest(socket: { on: (event: string, listener: (...args: unknown[]) => void) => unknown }, event: string, handler: (payload: unknown) => Promise<unknown>): void {
  socket.on(event, (...args: unknown[]) => {
    const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
    const payload = args[0] === ack ? undefined : args[0];
    void handleWithAck(ack, () => handler(payload));
  });
}

export { getRealtimePingIntervalMs, onRequest, toConnectError };
