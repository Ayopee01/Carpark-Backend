// Import Library
import type { IncomingMessage } from 'http';
import type { Socket } from 'socket.io';
// Import Types
import type { Permission } from './user.type';

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

/* -------------------------------------- Socket.IO Types -------------------------------------- */

// Type ผลที่ส่งกลับทาง ack ของ event ที่ client ส่งมา (เช่น <stream>:subscribe)
export type SocketAckResponse = { ok: true; data?: unknown } | { ok: false; error: { code: string | null; message: string; details?: Record<string, unknown> } };

// Type callback ack ของ Socket.IO
export type SocketAck = (response: SocketAckResponse) => void;

// Type stream ของ Admin ที่ subscribe ได้
export type AdminStream = 'dashboard' | 'overview' | 'transactions' | 'devices' | 'payments';

// Type ข้อมูลที่ผูกกับ socket ของ Admin (streams = refresh ของ stream ที่ subscribe อยู่ เรียกเมื่อข้อมูลเปลี่ยน)
export interface AdminSocketData {
  userId: string;
  sessionId: string;
  permissions: Permission[];
  streams: Map<AdminStream, (trigger: DashboardUpdatedEvent) => void>;
}

// Type ตัวกรอง lpr_detected ของหน้าจอ Barrier Gate (ส่งมาใน handshake auth)
export interface LprFilters {
  gateId: string | null;
  direction: string | null;
  cameraId: string | null;
}

// Type ข้อมูลที่ผูกกับ socket ของ client (public = mobile ไม่มี device credentials)
export interface ClientSocketData {
  ip: string | undefined;
  clientType: string;
  deviceId: string | null;
  deviceToken: string | null;
  filters: LprFilters;
}

// Type socket ของ namespace /admin
export type AdminSocket = Socket & { data: AdminSocketData };

// Type socket ของ namespace /client
export type ClientSocket = Socket & { data: ClientSocketData };

// Type error ที่ส่งให้ client ตอน handshake ไม่ผ่าน (Socket.IO ส่ง message และ data ไปที่ event connect_error)
export type RealtimeConnectError = Error & { data: { statusCode: number; code: string | null; reason?: string; details?: Record<string, unknown> } };

// Type function หา IP จริงของ client หลัง reverse proxy (ใช้ trust proxy fn ชุดเดียวกับ Express)
export type SocketIpResolver = (request: IncomingMessage) => string | undefined;
