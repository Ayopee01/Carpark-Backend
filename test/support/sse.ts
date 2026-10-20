// Import Library
import EventEmitter from 'node:events';
import type { Request, Response } from 'express';
// Import Test Helpers
import { fixture } from './mock';

/* -------------------------------------- Types -------------------------------------- */

// Type event ที่ SSE เขียนออกมา
interface SseEvent {
  type: string;
  reason?: string;
  trigger?: { reason?: string };
  data?: unknown;
  pendingAmount?: number;
  pingIntervalMs?: number;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function สร้าง req/res ขั้นต่ำของ SSE และเก็บ event ที่เขียนออกมา
function mockSse(user?: { id: string }): { req: Request & EventEmitter; res: Response; events: SseEvent[]; isEnded: () => boolean } {
  const req = Object.assign(new EventEmitter(), user ? { sessionId: 'sess_1', user } : {});
  const events: SseEvent[] = [];
  let ended = false;
  const res = {
    setHeader() {},
    flushHeaders() {},
    write: (chunk: string) => events.push(JSON.parse(chunk.slice(6)) as SseEvent),
    end: () => {
      ended = true;
    },
  };
  return { req: fixture<Request & EventEmitter>(req), res: fixture<Response>(res), events, isEnded: () => ended };
}

export { mockSse };
export type { SseEvent };
