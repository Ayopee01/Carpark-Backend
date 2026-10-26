// Import Library
import type EventEmitter from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
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
  ip?: string;
  pingIntervalMs?: number;
}

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function สร้าง req/res ของ SSE (better-sse ต้องการ IncomingMessage/ServerResponse จริง) และเก็บ data ของทุก event ที่เขียนออกมา
function mockSse(user?: { id: string; permissions?: string[] }): { req: Request & EventEmitter; res: Response; events: SseEvent[]; isEnded: () => boolean } {
  const req = Object.assign(new IncomingMessage(new Socket()), user ? { sessionId: 'sess_1', user } : {});
  const res = new ServerResponse(req);
  const events: SseEvent[] = [];
  let ended = false;
  Object.assign(res, {
    writeHead: () => res,
    // frame ของ better-sse คือ event:/id:/data: คั่นด้วยบรรทัด อ่านเฉพาะบรรทัด data
    write: (chunk: string) => {
      String(chunk).split('\n').filter((line) => line.startsWith('data:')).forEach((line) => events.push(JSON.parse(line.slice(5)) as SseEvent));
      return true;
    },
    end: () => {
      ended = true;
      return res;
    },
  });
  return { req: fixture<Request & EventEmitter>(req), res: fixture<Response>(res), events, isEnded: () => ended };
}

export { mockSse };
export type { SseEvent };
