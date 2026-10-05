// Import Library
import crypto from 'crypto';
// Import Types
import type { SocketTicket } from '../../types/shared/realtime.type';
// Import Utils
import { hashToken } from '../../utils/crypto';

/* -------------------------------------- Config -------------------------------------- */

// Config อายุ ticket ของ Admin payment WebSocket (วินาที) สั้นพอให้ browser ใช้ต่อ WebSocket ทันทีหลังขอ
const SOCKET_TICKET_TTL_SECONDS = 30;

// Config ticket ที่ออกแล้วยังไม่ถูกใช้ (key = hash ของ ticket) เก็บใน memory เพราะ API รันได้ instance เดียวเหมือน realtime event
const tickets = new Map<string, SocketTicket>();

/* -------------------------------------- Helpers -------------------------------------- */

// Function ลบ ticket ที่หมดอายุแล้วออกจาก memory
function pruneExpiredTickets(now: number = Date.now()): void {
  for (const [key, ticket] of tickets.entries()) {
    if (ticket.expiresAt <= now) tickets.delete(key);
  }
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ออก ticket ใช้ครั้งเดียวที่ผูกกับ user, session และ chargeId ให้ browser ต่อ WebSocket โดยไม่ต้องถือ access token
function issueSocketTicket({ userId, sessionId, chargeId }: Omit<SocketTicket, 'expiresAt'>): { ticket: string; expiresIn: number } {
  pruneExpiredTickets();
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(hashToken(ticket), { userId, sessionId, chargeId, expiresAt: Date.now() + SOCKET_TICKET_TTL_SECONDS * 1000 });
  return { ticket, expiresIn: SOCKET_TICKET_TTL_SECONDS };
}

// Function ใช้ ticket (ลบทิ้งทันทีจึงใช้ซ้ำไม่ได้) คืนข้อมูล ticket ถ้ายังไม่หมดอายุและ chargeId ตรง ไม่งั้นคืน null
function consumeSocketTicket(ticket: string | null | undefined, chargeId: string | null | undefined): SocketTicket | null {
  if (!ticket) return null;
  const key = hashToken(ticket);
  const saved = tickets.get(key);
  tickets.delete(key);
  if (!saved || saved.expiresAt <= Date.now() || !chargeId || saved.chargeId !== chargeId) return null;
  return saved;
}

export { consumeSocketTicket, issueSocketTicket };
