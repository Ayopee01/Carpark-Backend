// Import Library
import type { WebSocket } from 'ws';

/* -------------------------------------- SSE Types -------------------------------------- */

// Type ตัวเลือกตอนเปิด SSE stream
export interface SseStreamOptions {
  connected?: Record<string, unknown>;
  onPing?: () => void | Promise<void>;
}

// Type helper ของ SSE stream ที่เปิดแล้ว
export interface SseStream {
  write: (payload: unknown) => void;
  addCleanup: (cleanup: () => void) => void;
  addInterval: (callback: () => void | Promise<void>, intervalMs: number) => NodeJS.Timeout;
  close: () => void;
  isClosed: () => boolean;
}

// Type option ของ Admin SSE ที่ส่งข้อมูลชุดใหม่ทุกครั้งที่ transaction/payment เปลี่ยน (event <name>_snapshot, <name>_updated, <name>_error)
export interface RefreshStreamOptions<T> {
  name: string;
  connectedMessage: string;
  errorMessage: string;
  load: () => Promise<T>;
  preload?: boolean;
  refreshOnDayChange?: boolean;
}

// Type option ของ Admin SSE ที่ส่ง snapshot ตอนเชื่อมต่อแล้วส่งต่อ app event (key = ชื่อ app event, value = แปลงเป็น payload ที่ส่ง)
export interface ForwardStreamOptions<T> {
  connectedMessage: string;
  loadSnapshot: () => Promise<T>;
  toSnapshotEvent: (snapshot: T) => Record<string, unknown>;
  events: Record<string, (payload: unknown) => unknown>;
}

/* -------------------------------------- App Events Types -------------------------------------- */

// Type ข้อมูลของ event dashboard_updated
export interface DashboardUpdatedEvent {
  reason: string;
  transactionId: string | null;
  plateNo: string | null;
  at: string;
}

// Type ข้อมูลของ event session_revoked
export interface SessionRevokedEvent {
  sessionId: string | null;
  userId: string | null;
  reason: string;
  at: string;
}

/* -------------------------------------- Payment WebSocket Types -------------------------------------- */

// Type สิ่งที่ client subscribe (chargeId หรือทะเบียน)
export interface PaymentSubscription {
  plateNo: string;
  chargeId: string;
}

// Type WebSocket ที่มีสถานะ heartbeat
export type AliveWebSocket = WebSocket & { isAlive?: boolean };

// Type ชื่อ payment WebSocket
export type PaymentSocketName = 'client' | 'admin';

// Type session ของ Admin ที่ผูกกับ payment WebSocket (ใช้ตัด connection เมื่อ session จบ, chargeId = connection ที่เปิดด้วย ticket subscribe ได้แค่ charge นี้)
export interface AdminSocketSession {
  sessionId: string;
  userId: string;
  chargeId?: string;
}

// Type ticket ใช้ครั้งเดียวของ Admin payment WebSocket (expiresAt เป็น ms)
export interface SocketTicket {
  userId: string;
  sessionId: string;
  chargeId: string;
  expiresAt: number;
}

// Type ผลตรวจ access token ตอน handshake ของ Admin payment WebSocket (ไม่ผ่าน = ปิดด้วย close code และ reason)
export type AdminSocketAuth = { ok: true; session: AdminSocketSession } | { ok: false; code: number; reason: string };
