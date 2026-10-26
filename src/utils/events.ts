// Import Library
import EventEmitter from 'events';
// Import Types
import type { DashboardUpdatedEvent, SessionRevokedEvent } from '../types/shared/realtime.type';

/* -------------------------------------- Config -------------------------------------- */

// Config event emitter กลางของ app ใช้ส่ง realtime event ระหว่าง service และ Socket.IO
const appEvents = new EventEmitter();

// namespace ของ Socket.IO แต่ละชุดเพิ่ม listener ของตัวเอง (เลิกฟังตอนปิด) test เปิดได้หลายชุดพร้อมกันจึงไม่จำกัดจำนวน
appEvents.setMaxListeners(0);

/* -------------------------------------- Functions -------------------------------------- */

// Function แจ้ง dashboard, overview และ transaction list ว่า transaction มีการเปลี่ยนแปลง
function emitDashboardUpdated(reason: string, transaction?: { id?: string | null; plateNo?: string | null } | null): void {
  const event: DashboardUpdatedEvent = {
    reason,
    transactionId: transaction?.id || null,
    plateNo: transaction?.plateNo || null,
    at: new Date().toISOString(),
  };
  appEvents.emit('dashboard_updated', event);
}

// Function แจ้ง Socket.IO ของ Admin ให้ปิด stream (ระบุ sessionId = session เดียว, ระบุแค่ userId = ทุก session ของ user)
function emitSessionRevoked({ sessionId = null, userId = null, reason }: { sessionId?: string | null; userId?: string | null; reason: string }): void {
  const event: SessionRevokedEvent = { sessionId, userId, reason, at: new Date().toISOString() };
  appEvents.emit('session_revoked', event);
}

export { appEvents, emitDashboardUpdated, emitSessionRevoked };
