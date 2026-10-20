// Import Library
import 'dotenv/config';
import http from 'http';
// Import Config
import { prisma } from './db/prisma';
// Import Services
import * as deviceRegistryService from './services/shared/device-registry.service';
// Import Realtime
import { attachPaymentWebSocket } from './realtime/socket';
// Import App
import app from './app';

/* -------------------------------------- Config -------------------------------------- */

// Config port ของ HTTP server (ต้องตั้งใน .env)
if (!process.env.PORT) throw new Error('PORT is required');
const PORT = Number(process.env.PORT);
if (!Number.isInteger(PORT) || PORT <= 0) throw new Error('PORT must be a positive integer');

// DATABASE_URL ต้องมีก่อน start เพราะ Prisma จะ error ตอน query แรกซึ่งช้าเกินไป
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

// Config เวลาปิด server: รอ request ปกติก่อนตัด SSE และบังคับออกก่อน Docker kill (10 วินาที)
const SHUTDOWN_TIMEOUT = { closeStreamsAfterMs: 3000, forceExitAfterMs: 8000 };

/* -------------------------------------- Functions -------------------------------------- */

const server = http.createServer(app);
const paymentSockets = attachPaymentWebSocket(server);

server.listen(PORT, () => {
  console.log(`Smart Carpark API is running on port ${PORT}`);
});
deviceRegistryService.startDeviceRuntimeMonitor();

// Function ปิด server อย่างปลอดภัยเมื่อได้รับ SIGTERM/SIGINT ตอน redeploy
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down...`);
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT.forceExitAfterMs).unref();

  // หยุดรับ request ใหม่ แล้วรอ request ที่กำลังทำงาน (เช่น payment) ให้เสร็จ
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  server.closeIdleConnections();

  // ปิด WebSocket ทันที client จะ reconnect ไปที่ container ใหม่เอง
  Object.values(paymentSockets).forEach((wss) => {
    wss.clients.forEach((client) => client.close(1001, 'Server restarting'));
  });
  setTimeout(() => server.closeAllConnections(), SHUTDOWN_TIMEOUT.closeStreamsAfterMs).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
