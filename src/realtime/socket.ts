// Import Library
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
// Import Services
import * as authService from '../services/auth.service';
import * as paymentRealtimeService from '../services/shared/payment-realtime.service';
import * as socketTicketService from '../services/shared/socket-ticket.service';
// Import Realtime
import { getRealtimePingIntervalMs } from './sse';
// Import Types
import type { PaymentUpdateEvent } from '../types/shared/payment.type';
import type { AdminSocketAuth, AdminSocketSession, AliveWebSocket, PaymentSocketName, PaymentSubscription, SessionRevokedEvent } from '../types/shared/realtime.type';
import type { Permission } from '../types/shared/user.type';
// Import Utils
import { ApiError } from '../utils/api-error';
import { readAccessCookie } from '../utils/auth-cookies';
import { appEvents } from '../utils/events';
import { isAdminOrigin } from '../utils/origins';

/* -------------------------------------- Config -------------------------------------- */

// Config path ของ payment WebSocket ฝั่ง client และ Admin
const PAYMENT_SOCKET_PATHS: Record<PaymentSocketName, string> = { client: '/api/client/payments/ws', admin: '/api/payments/ws' };

// Config permission ที่ Admin ต้องมีเพื่อ subscribe payment WebSocket
const ADMIN_SOCKET_PERMISSION: Permission = 'transactions';

// Config close code ของ Admin payment WebSocket ให้ frontend แยกได้ว่าควร login ใหม่, แสดงไม่มีสิทธิ์ หรือ reconnect
const ADMIN_SOCKET_CLOSE_CODES = { unauthorized: 4401, forbidden: 4403, internalError: 1011 };

// Config ขนาด message สูงสุดที่รับจาก client (ใช้แค่ข้อความ subscribe สั้น ๆ)
const MAX_SOCKET_PAYLOAD_BYTES = 16 * 1024;

/* -------------------------------------- Helpers -------------------------------------- */

// Function แปลงเลขทะเบียนเป็นตัวพิมพ์เล็กไม่มีช่องว่าง/ขีด เพื่อใช้เทียบ subscription
function normalizePlateNo(plateNo: unknown): string {
  return plateNo ? String(plateNo).trim().replace(/[\s-]/g, '').toLowerCase() : '';
}

// Function ตรวจสอบว่า event ตรงกับ subscription หรือไม่
function matchesSubscription(subscription: PaymentSubscription, event: Partial<PaymentUpdateEvent>): boolean {
  if (subscription.chargeId && subscription.chargeId === event.chargeId) return true;
  if (subscription.plateNo && subscription.plateNo === normalizePlateNo(event.plateNo)) return true;
  return false;
}

// Function ส่งข้อมูล JSON ผ่าน WebSocket
function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

// Function ปฏิเสธ upgrade request ด้วย HTTP status แล้วปิด socket
function rejectUpgrade(socket: Duplex, statusCode: number, message: string): void {
  socket.end(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

// Function ตรวจ ticket ที่ได้จาก POST /api/payments/ws-ticket (ใช้ครั้งเดียว, chargeId ต้องตรง) แล้วตรวจ session และ permission ของเจ้าของ ticket ซ้ำ
async function authenticateAdminTicket(ticket: string, chargeId: string | null): Promise<AdminSocketAuth> {
  const saved = socketTicketService.consumeSocketTicket(ticket, chargeId);
  if (!saved) return { ok: false, code: ADMIN_SOCKET_CLOSE_CODES.unauthorized, reason: 'invalid_token' };
  try {
    const reason = await authService.getSessionEndReasonById(saved.sessionId, saved.userId, { permission: ADMIN_SOCKET_PERMISSION });
    if (reason) return { ok: false, code: reason === 'forbidden' ? ADMIN_SOCKET_CLOSE_CODES.forbidden : ADMIN_SOCKET_CLOSE_CODES.unauthorized, reason };
  } catch (err) {
    console.error('Admin payment socket ticket check failed:', err);
    return { ok: false, code: ADMIN_SOCKET_CLOSE_CODES.internalError, reason: 'internal_error' };
  }
  return { ok: true, session: { sessionId: saved.sessionId, userId: saved.userId, chargeId: saved.chargeId } };
}

// Function ตรวจตัวตน Admin ตอน handshake
// - browser: Origin ต้องเป็นของ Admin Frontend (กัน Cross-Site WebSocket Hijacking เพราะ CORS ไม่คุม WebSocket) แล้วใช้ access cookie หรือ ticket
// - client อื่นไม่มี Origin: Authorization: Bearer (หรือ ?token= ที่จะเลิกรับ)
async function authenticateAdminUpgrade(req: IncomingMessage, url: URL): Promise<AdminSocketAuth> {
  const origin = req.headers.origin;
  if (origin && !isAdminOrigin(origin)) return { ok: false, code: ADMIN_SOCKET_CLOSE_CODES.forbidden, reason: 'origin_not_allowed' };

  const ticket = url.searchParams.get('ticket');
  if (ticket) return authenticateAdminTicket(ticket, url.searchParams.get('chargeId'));

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : url.searchParams.get('token') || (origin ? readAccessCookie(req) : null);
  try {
    const { user, sessionId } = await authService.authenticateAccessToken(token);
    if (!(Array.isArray(user.permissions) && user.permissions.includes(ADMIN_SOCKET_PERMISSION))) {
      return { ok: false, code: ADMIN_SOCKET_CLOSE_CODES.forbidden, reason: 'forbidden' };
    }
    return { ok: true, session: { sessionId, userId: user.id } };
  } catch (err) {
    // error อื่นที่ไม่ใช่ token/session (เช่น database) ให้ frontend reconnect ตามปกติ
    if (!(err instanceof ApiError && err.statusCode === 401)) {
      console.error('Admin payment socket authentication failed:', err);
      return { ok: false, code: ADMIN_SOCKET_CLOSE_CODES.internalError, reason: 'internal_error' };
    }
    const reason = await authService.getAccessTokenEndReason(token).catch(() => 'invalid_token');
    return { ok: false, code: ADMIN_SOCKET_CLOSE_CODES.unauthorized, reason };
  }
}

// Function ปิด Admin payment WebSocket ตามเหตุผลที่ session ใช้ต่อไม่ได้ (forbidden = 4403, อื่น ๆ = 4401)
function closeAdminSocket(ws: WebSocket, reason: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.close(reason === 'forbidden' ? ADMIN_SOCKET_CLOSE_CODES.forbidden : ADMIN_SOCKET_CLOSE_CODES.unauthorized, reason);
}

// Function ตรวจ session และ permission ของ Admin payment WebSocket ที่เชื่อมต่ออยู่ ถ้าใช้ต่อไม่ได้ให้ปิด
async function checkAdminSocketSession(ws: WebSocket, session: AdminSocketSession): Promise<void> {
  try {
    const reason = await authService.getSessionEndReasonById(session.sessionId, session.userId, { permission: ADMIN_SOCKET_PERMISSION });
    if (reason) closeAdminSocket(ws, reason);
  } catch (err) {
    console.error('Admin payment socket session check failed:', err);
  }
}

// Function ส่งสถานะ payment ปัจจุบันให้ client ตาม chargeId
async function sendCurrentChargeStatus(ws: WebSocket, subscription: PaymentSubscription): Promise<void> {
  if (!subscription.chargeId) return;
  try {
    const snapshot = await paymentRealtimeService.buildPaymentUpdateSnapshot(subscription.chargeId);
    if (snapshot) sendJson(ws, snapshot);
  } catch {
    sendJson(ws, { type: 'error', message: 'Unable to load payment status' });
  }
}

// Function สร้าง WebSocket server ของ payment (noServer) ที่ส่ง payment_updated ให้ client ที่ subscribe chargeId หรือ plateNo
// connection ที่มี Admin session จะถูกปิดเมื่อ session จบหรือ user ไม่มี permission แล้ว (ตรวจจาก event และทุกรอบ ping)
function createPaymentWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_SOCKET_PAYLOAD_BYTES });
  const subscriptions = new Map<WebSocket, PaymentSubscription>();
  const adminSessions = new Map<WebSocket, AdminSocketSession>();

  wss.on('connection', (ws: AliveWebSocket, req: IncomingMessage, session?: AdminSocketSession) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const subscription: PaymentSubscription = {
      plateNo: normalizePlateNo(url.searchParams.get('plateNo')),
      chargeId: url.searchParams.get('chargeId') || '',
    };
    subscriptions.set(ws, subscription);
    if (session) adminSessions.set(ws, session);
    ws.isAlive = true;

    sendJson(ws, {
      type: 'connected',
      message: 'Payment websocket connected',
      subscribed: {
        plateNo: subscription.plateNo || null,
        chargeId: subscription.chargeId || null,
      },
    });
    void sendCurrentChargeStatus(ws, subscription);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message: Buffer) => {
      try {
        const payload = JSON.parse(String(message));
        if (payload.type === 'subscribe') {
          // connection ที่เปิดด้วย ticket ผูกกับ chargeId ของ ticket เปลี่ยนไป charge หรือทะเบียนอื่นไม่ได้
          if (session?.chargeId && (String(payload.chargeId || '') !== session.chargeId || payload.plateNo)) {
            sendJson(ws, { type: 'error', message: 'This connection is bound to the ticket chargeId' });
            return;
          }
          const nextSubscription: PaymentSubscription = {
            plateNo: normalizePlateNo(payload.plateNo),
            chargeId: payload.chargeId ? String(payload.chargeId) : '',
          };
          subscriptions.set(ws, nextSubscription);
          sendJson(ws, { type: 'subscribed' });
          void sendCurrentChargeStatus(ws, nextSubscription);
        }
      } catch {
        sendJson(ws, { type: 'error', message: 'Invalid websocket message' });
      }
    });

    ws.on('close', () => {
      subscriptions.delete(ws);
      adminSessions.delete(ws);
    });
  });

  // รับ event payment_updated แล้วส่งต่อให้ client ที่ subscribe ตรงกัน
  const onPaymentUpdated = (event: PaymentUpdateEvent): void => {
    for (const [ws, subscription] of subscriptions.entries()) {
      if (matchesSubscription(subscription, event)) sendJson(ws, event);
    }
  };

  // ปิด Admin connection ทันทีเมื่อ logout, revoke หรือ user ถูกระงับ/ลบ (เงื่อนไขเดียวกับ Admin SSE)
  const onSessionRevoked = (event: SessionRevokedEvent): void => {
    for (const [ws, session] of adminSessions.entries()) {
      const matched = event.sessionId ? event.sessionId === session.sessionId : event.userId === session.userId;
      if (matched) closeAdminSocket(ws, event.reason);
    }
  };

  appEvents.on('payment_updated', onPaymentUpdated);
  appEvents.on('session_revoked', onSessionRevoked);

  // heartbeat ตรวจสอบ client ยังเชื่อมต่ออยู่หรือไม่
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as AliveWebSocket;
      if (ws.isAlive === false) {
        subscriptions.delete(ws);
        adminSessions.delete(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
      // ตรวจซ้ำตามรอบ ping เพื่อจับ session ที่หมดอายุเองหรือ permission ที่ถูกถอด
      const session = adminSessions.get(ws);
      if (session) void checkAdminSocketSession(ws, session);
    }
  }, getRealtimePingIntervalMs());
  heartbeat.unref?.();

  wss.on('close', () => {
    clearInterval(heartbeat);
    appEvents.off('payment_updated', onPaymentUpdated);
    appEvents.off('session_revoked', onSessionRevoked);
  });

  return wss;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ผูก payment WebSocket ทั้งฝั่ง client และ Admin เข้ากับ HTTP server โดยเลือก server ตาม path ของ upgrade request
function attachPaymentWebSocket(server: Server): Record<PaymentSocketName, WebSocketServer> {
  const sockets: Record<PaymentSocketName, WebSocketServer> = { client: createPaymentWebSocketServer(), admin: createPaymentWebSocketServer() };

  // ใช้ upgrade handler เดียว เพราะ WebSocketServer หลายตัวที่ผูก server เดียวกันจะ abort handshake ของ path อื่น
  server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // socket อาจ error ระหว่างรอตรวจ token ถ้าไม่มี listener process จะล่ม
    socket.on('error', () => socket.destroy());
    const url = new URL(req.url ?? '/', 'http://localhost');
    const name = (Object.keys(PAYMENT_SOCKET_PATHS) as PaymentSocketName[]).find((key) => PAYMENT_SOCKET_PATHS[key] === url.pathname);
    if (!name) return rejectUpgrade(socket, 404, 'Not Found');

    const wss = sockets[name];
    if (name !== 'admin') return wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));

    // Admin ที่ไม่ผ่านต้อง upgrade ก่อนแล้วปิดด้วย close code เพราะ browser มองไม่เห็น HTTP 401/403 ของ handshake (เห็นแค่ 1006)
    const auth = await authenticateAdminUpgrade(req, url);
    return wss.handleUpgrade(req, socket, head, (ws) => {
      if (!auth.ok) return ws.close(auth.code, auth.reason);
      return wss.emit('connection', ws, req, auth.session);
    });
  });

  return sockets;
}

export { attachPaymentWebSocket };
