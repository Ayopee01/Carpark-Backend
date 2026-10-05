// Import Library
import cors from 'cors';
import express from 'express';
import type { CorsOptions } from 'cors';
import type { NextFunction, Request, Response } from 'express';
import type { IncomingMessage } from 'http';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
// Import Middlewares
import { authMiddleware } from './middlewares/auth.middleware';
import { requireDeviceAuth } from './middlewares/device-auth.middleware';
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
import { ApiError } from './utils/api-error';
import { isAdminOrigin, isClientOrigin } from './utils/origins';
import { UPLOAD_DIR } from './utils/uploads';

/* -------------------------------------- Config -------------------------------------- */

// Config จำนวน reverse proxy หน้า API (1 = nginx ชั้นเดียว) เพื่อให้ req.ip เป็น IP จริงของ client ต้องตั้งใน .env
const TRUST_PROXY = (() => {
  const raw = process.env.TRUST_PROXY;
  if (!raw) throw new Error('TRUST_PROXY is required');
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error('TRUST_PROXY must be an integer greater than or equal to 0');
  return value;
})();

// Config CORS ร่วมของ Admin และ client: method ที่ใช้, header ที่ frontend อ่านได้ (Retry-After ตอน 429) และอายุ cache ของ preflight
const CORS_COMMON: CorsOptions = {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'Content-Disposition'],
  maxAge: 600,
};

// Config header ที่ browser ของ Admin ส่งได้ (auth ใช้ cookie จึงไม่มี Authorization)
const ADMIN_CORS_HEADERS = ['Content-Type', 'Last-Event-ID'];

// Config path ที่ client อื่น (Kiosk/Barrier Gate/Mobile) เรียกจาก browser ได้
const CLIENT_API_PREFIX = '/api/client';

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือก CORS options ตาม origin ของ request
// - Admin (ADMIN_ORIGINS): สะท้อน origin ตรงตัว + credentials ใช้ session cookie ได้
// - client อื่น (CLIENT_ORIGINS): เฉพาะ /api/client แบบไม่มี credentials (path อื่นไม่ส่ง CORS header)
// - ไม่มี Origin (server, อุปกรณ์, <img>): ผ่านโดยไม่มี CORS header, origin อื่นตอบ 403 CORS_NOT_ALLOWED
function corsOptionsFor(req: Request, callback: (err: Error | null, options?: CorsOptions) => void): void {
  const origin = req.get('origin');
  if (!origin) return callback(null, { origin: false });
  if (isAdminOrigin(origin)) return callback(null, { ...CORS_COMMON, origin: true, credentials: true, allowedHeaders: ADMIN_CORS_HEADERS });
  if (isClientOrigin(origin)) return callback(null, req.path.startsWith(CLIENT_API_PREFIX) ? { ...CORS_COMMON, origin: true, credentials: false } : { origin: false });
  return callback(new ApiError(403, 'CORS_NOT_ALLOWED', 'Not allowed by CORS'));
}

// Function ส่ง request ของกล้องที่มี device credentials ไปที่ camera route ส่วนที่เหลือไปผ่าน Admin auth
function routeCameraDevicesOnly(req: Request, _res: Response, next: NextFunction): void {
  if (!req.get('x-device-id') && !req.body?.deviceId) return next('route');
  return next();
}

/* -------------------------------------- Functions -------------------------------------- */

const app = express();

app.set('trust proxy', TRUST_PROXY);
// อนุญาตให้ frontend ต่าง origin โหลดรูปจาก /uploads ได้
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptionsFor));
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
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
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
app.post('/api/transactions', routeCameraDevicesOnly, requireDeviceAuth(['camera']), handleCameraTransactionRequest);

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
