// Import Library
import pino from 'pino';
import type { TransportSingleOptions } from 'pino';

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือก transport ของ log: นอก production ใช้ pino-pretty อ่านง่าย (ถ้าติดตั้งไว้) production เขียน JSON บรรทัดละ log ให้ระบบเก็บ log อ่าน
function getTransport(): TransportSingleOptions | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' } };
  } catch {
    // image production ไม่มี devDependencies จึงไม่มี pino-pretty
    return undefined;
  }
}

/* -------------------------------------- Config -------------------------------------- */

// Config field ที่มี credential ซึ่งห้ามเขียนลง log (กันพลาดกรณี log object ที่มี header ติดมา)
const REDACT_PATHS = ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-device-token"]', 'res.headers["set-cookie"]', '*.password', '*.passwordHash', '*.refreshToken', '*.token'];

// Config logger กลางของ API ระดับ log จาก LOG_LEVEL (ไม่ตั้ง = info, test ตั้ง silent)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  ...(process.env.LOG_LEVEL === 'silent' ? {} : { transport: getTransport() }),
});

export { logger };
