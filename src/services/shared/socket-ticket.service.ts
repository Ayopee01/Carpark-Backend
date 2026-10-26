// Import Library
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
// Import Types
import type { SocketTicket } from '../../types/shared/realtime.type';
// Import Utils
import { hashToken } from '../../utils/crypto';

/* -------------------------------------- Config -------------------------------------- */

// Config อายุ ticket ของ Admin payment WebSocket (วินาที) สั้นพอให้ browser ใช้ต่อ WebSocket ทันทีหลังขอ
const SOCKET_TICKET_TTL_SECONDS = 30;

// Config จำนวน ticket สูงสุดที่ค้างใน memory (rate limit ขอ ticket ได้ 30 ครั้ง/นาที/user จึงเกินนี้ได้ยาก)
const MAX_PENDING_TICKETS = 10000;

// Config ticket ที่ออกแล้วยังไม่ถูกใช้ (key = hash ของ ticket) เก็บใน memory เพราะ API รันได้ instance เดียวเหมือน realtime event
// lru-cache ลบ ticket ที่หมดอายุให้เอง (get คืน undefined เมื่อเกิน ttl)
const tickets = new LRUCache<string, SocketTicket>({ max: MAX_PENDING_TICKETS, ttl: SOCKET_TICKET_TTL_SECONDS * 1000 });

/* -------------------------------------- Functions -------------------------------------- */

// Function ออก ticket ใช้ครั้งเดียวที่ผูกกับ user, session และ chargeId ให้ browser ต่อ WebSocket โดยไม่ต้องถือ access token
function issueSocketTicket({ userId, sessionId, chargeId }: SocketTicket): { ticket: string; expiresIn: number } {
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(hashToken(ticket), { userId, sessionId, chargeId });
  return { ticket, expiresIn: SOCKET_TICKET_TTL_SECONDS };
}

// Function ใช้ ticket (ลบทิ้งทันทีจึงใช้ซ้ำไม่ได้) คืนข้อมูล ticket ถ้ายังไม่หมดอายุและ chargeId ตรง ไม่งั้นคืน null
function consumeSocketTicket(ticket: string | null | undefined, chargeId: string | null | undefined): SocketTicket | null {
  if (!ticket) return null;
  const key = hashToken(ticket);
  const saved = tickets.get(key);
  tickets.delete(key);
  if (!saved || !chargeId || saved.chargeId !== chargeId) return null;
  return saved;
}

export { consumeSocketTicket, issueSocketTicket };
