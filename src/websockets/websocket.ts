// Import Library
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
// Import WebSockets
import { attachAdminNamespace } from './admin.socket';
import { attachClientNamespace } from './client.socket';
// Import Types
import type { SocketIpResolver } from '../types/shared/realtime.type';
// Import App
import { CORS_ORIGINS } from '../app';
// Import Utils
import { getRealtimePingIntervalMs } from '../utils/socket';

/* -------------------------------------- Config -------------------------------------- */

// Config path ของ Socket.IO (nginx ต้อง proxy path นี้พร้อม header Upgrade)
const SOCKET_IO_PATH = '/socket.io';

// Config ขนาด message สูงสุดที่รับจาก client (ใช้แค่ข้อความ subscribe สั้น ๆ)
const MAX_SOCKET_PAYLOAD_BYTES = 16 * 1024;

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง Socket.IO server บน HTTP server เดียวกับ API มี namespace /admin (Admin Frontend) และ /client (Kiosk, Barrier Gate, Mobile)
// Socket.IO จัดการ heartbeat (pingInterval = REALTIME_PING_INTERVAL_MS), reconnect และ fallback เป็น HTTP long-polling ให้เอง
// close = เลิกฟัง app event, ตัดทุก connection (client จะ reconnect ไปที่ server ใหม่เอง) และปิด Socket.IO โดยไม่ปิด HTTP server
function setupWebSocket(server: HttpServer, { getIp }: { getIp: SocketIpResolver }): { io: Server; close: () => void } {
  const io = new Server(server, {
    path: SOCKET_IO_PATH,
    pingInterval: getRealtimePingIntervalMs(),
    maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
    serveClient: false,
    // CORS ของ long-polling ใช้ origin เดียวกับ API (auth ส่ง token ใน handshake ไม่ใช้ cookie)
    cors: { origin: CORS_ORIGINS },
  });

  const detachers = [attachAdminNamespace(io), attachClientNamespace(io, getIp)];
  const close = (): void => {
    detachers.forEach((detach) => detach());
    io.disconnectSockets(true);
    io.engine.close();
  };
  return { io, close };
}

export { setupWebSocket };
