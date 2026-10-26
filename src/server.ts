// Import Library
import 'dotenv/config';
import http from 'http';
import proxyaddr from 'proxy-addr';
// Import Config
import { prisma } from './db/prisma';
// Import Services
import * as authService from './services/auth.service';
import * as deviceRegistryService from './services/shared/device-registry.service';
// Import WebSockets
import { setupWebSocket } from './websockets/websocket';
// Import App
import app from './app';
// Import Utils
import { logger } from './utils/logger';

/* -------------------------------------- Config -------------------------------------- */

// Config port ของ HTTP server (ต้องตั้งใน .env)
const PORT = Number(process.env.PORT);

// DATABASE_URL ต้องมีก่อน start เพราะ Prisma จะ error ตอน query แรกซึ่งช้าเกินไป
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

// Config เวลาปิด server: รอ request ปกติก่อนตัด Socket.IO และบังคับออกก่อน Docker kill (10 วินาที)
const SHUTDOWN_TIMEOUT = { closeStreamsAfterMs: 3000, forceExitAfterMs: 8000 };

/* -------------------------------------- Functions -------------------------------------- */

const server = http.createServer(app);
// IP จริงของ client หลัง proxy ใช้ trust proxy ชุดเดียวกับ Express (req.ip)
const webSocket = setupWebSocket(server, { getIp: (request) => proxyaddr(request, app.get('trust proxy fn')) });

server.listen(PORT, () => {
  logger.info(`Smart Carpark API is running on port ${PORT}`);
});
deviceRegistryService.startDeviceRuntimeMonitor();
authService.startSessionCleanupMonitor();

// Function ปิด server อย่างปลอดภัยเมื่อได้รับ SIGTERM/SIGINT ตอน redeploy
function shutdown(signal: NodeJS.Signals): void {
  logger.info(`${signal} received, shutting down...`);
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT.forceExitAfterMs).unref();

  // หยุดรับ request ใหม่ แล้วรอ request ที่กำลังทำงาน (เช่น payment) ให้เสร็จ
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  server.closeIdleConnections();

  // ตัด Socket.IO ทันที client จะ reconnect ไปที่ container ใหม่เอง
  webSocket.close();
  setTimeout(() => server.closeAllConnections(), SHUTDOWN_TIMEOUT.closeStreamsAfterMs).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
