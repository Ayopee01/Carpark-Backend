// Import Library
import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { IncomingMessage } from 'http';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
// Import Middlewares
import { authMiddleware } from './middlewares/auth.middleware';
import { requireDeviceAuth } from './middlewares/device.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
// Import Routes
import paymentsRoutes from './routes/payments.routes';
import authRoutes from './routes/auth.routes';
import clientRoutes from './routes/client.routes';
import dashboardRoutes from './routes/dashboard.routes';
import devicesRoutes from './routes/devices.routes';
import membersRoutes from './routes/members.routes';
import overviewRoutes from './routes/overview.routes';
import paymentGatewayRoutes from './routes/payment-gateway.routes';
import paymentSettingsRoutes from './routes/payment-settings.routes';
import pricingRoutes from './routes/pricing.routes';
import systemSettingsRoutes from './routes/system-settings.routes';
import themeRoutes from './routes/theme.routes';
import transactionsRoutes, { handleCameraTransactionRequest } from './routes/transactions.routes';
// Import Services
import * as healthService from './services/health.service';
// Import Docs
import openapi from './docs/openapi';
// Import Utils
import { logger } from './utils/logger';
import { UPLOAD_DIR } from './utils/uploads';

/* -------------------------------------- Config -------------------------------------- */

// Config จำนวน reverse proxy หน้า API (1 = nginx ชั้นเดียว) เพื่อให้ req.ip เป็น IP จริงของ client ต้องตั้งใน .env
const TRUST_PROXY = Number(process.env.TRUST_PROXY);

// Config origin ที่เรียก API จาก browser ได้ (บังคับตั้ง CORS_ORIGIN ใน .env คั่นหลาย origin ด้วย comma, * = ทุก origin)
const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (!CORS_ORIGIN) throw new Error('CORS_ORIGIN is required');
const CORS_ORIGINS = CORS_ORIGIN === '*' ? CORS_ORIGIN : CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

/* -------------------------------------- Functions -------------------------------------- */

const app = express();

app.set('trust proxy', TRUST_PROXY);
// อนุญาตให้ frontend ต่าง origin โหลดรูปจาก /uploads ได้
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Config CORS (auth ใช้ Bearer token ไม่มี cookie จึงไม่ต้องใช้ credentials) ให้ browser อ่าน Retry-After ตอน 429 และชื่อไฟล์ตอน download ได้
app.use(cors({
  origin: CORS_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'Content-Disposition'],
  maxAge: 600,
}));
app.use(express.json({
  // JSON ที่ระบบรับมีแค่ไม่กี่ KB จำกัด 1mb กัน body ก้อนใหญ่กิน memory (upload รูปใช้ multer ไม่ผ่านตรงนี้)
  limit: '1mb',
  verify: (req: IncomingMessage, _res, buf: Buffer) => {
    (req as Request).rawBody = buf?.length ? buf.toString('utf8') : '';
  },
}));
// Express 5 ไม่ตั้ง req.body เมื่อไม่มี JSON body จึงใส่ {} ให้ service ได้ error validation แบบเดิม
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.body ??= {};
  next();
});
// log ทุก request ผ่าน logger กลาง (5xx เป็น error, 4xx เป็น warn) เก็บเฉพาะ method, url, ip และ status ไม่เก็บ header (มี cookie/token)
app.use(pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  serializers: {
    req: (req: { id: unknown; method: string; url: string; remoteAddress?: string }) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
}));
app.use('/uploads', express.static(UPLOAD_DIR));

// Infra routes: ข้อมูล API, healthcheck และ Swagger (ไม่ใช่ API ของระบบ จึงไม่แยกเป็นไฟล์ route)
app.get('/', (_req, res) => {
  res.json({ name: 'smart-carpark-api', docs: '/docs', openapi: '/docs/openapi.json' });
});
app.get('/health', (_req, res) => {
  res.json(healthService.getHealth());
});
app.get('/health/db', async (_req, res, next) => {
  try {
    const result = await healthService.checkDatabase();
    res.status(result.statusCode).json(result.body);
  } catch (error) {
    next(error);
  }
});
app.get('/docs/openapi.json', (_req, res) => {
  res.json(openapi);
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(null, {
  customSiteTitle: 'Smart Carpark API Docs',
  swaggerOptions: { url: '/docs/openapi.json' },
}));

// Public routes: client/device และ payment gateway ต้องเข้าได้ก่อน Admin auth
app.use('/api/client', clientRoutes);
app.use('/api/payment-gateway', paymentGatewayRoutes);
app.post('/api/transactions', requireDeviceAuth(['camera']), handleCameraTransactionRequest);

// Admin routes: ต้องมี Bearer token และแต่ละ router ตรวจ permission ของตัวเอง
app.use(authMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/payment-settings', paymentSettingsRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/theme', themeRoutes);
app.use('/api/system-settings', systemSettingsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
export { CORS_ORIGINS };
