// Import Library
import express from 'express';
import type { Request } from 'express';
// Import Types
import type { ClientRequestContext } from '../types/client.type';
// Import Middlewares
import { optionalDeviceAuth, requireDeviceAuth } from '../middlewares/device-auth.middleware';
import { activationRateLimit, publicClientRateLimit } from '../middlewares/rate-limit.middleware';
// Import Services
import * as clientService from '../services/client.service';
// Import Realtime
import * as sse from '../realtime/sse';

/* -------------------------------------- Config -------------------------------------- */

// Config middleware ตรวจ device credentials เมื่อมี deviceId (kiosk/barrier gate) ส่วน mobile ไม่ส่ง deviceId
const clientDeviceAuth = optionalDeviceAuth(['kiosk', 'barrier_gate']);

/* -------------------------------------- Helpers -------------------------------------- */

// Function อ่าน deviceId ที่ client ส่งมาทาง query, body หรือ header
function getClientDeviceId(req: Request): string | undefined {
  const value: unknown = req.query?.deviceId || req.body?.deviceId || req.get('x-device-id');
  return typeof value === 'string' && value ? value : undefined;
}

// Function สร้างข้อมูลอุปกรณ์ที่ผ่าน device auth และ IP ของ request
function getClientContext(req: Request): ClientRequestContext {
  return { device: req.device, ip: req.ip };
}

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

// Route ดึง config พื้นฐานแบบ public (theme + ชื่อระบบ) ให้ client ใช้ก่อน activate หรือ login
router.get('/config', async (_req, res, next) => {
  try {
    res.json(await clientService.getClientConfig());
  } catch (error) {
    next(error);
  }
});

// Route เปิดใช้งาน kiosk/barrier gate ด้วย activation code
router.post('/activate', activationRateLimit, async (req, res, next) => {
  try {
    res.json(await clientService.activateDevice(req.body));
  } catch (error) {
    next(error);
  }
});

// Route heartbeat ของอุปกรณ์ที่มี device credentials
router.post('/heartbeat', requireDeviceAuth(['kiosk', 'barrier_gate', 'camera', 'printer']), async (req, res, next) => {
  try {
    res.json(await clientService.recordHeartbeat(req.device, req.body, req.ip));
  } catch (error) {
    next(error);
  }
});

// Route ค้นหารายการจอดที่ยังจ่ายได้จากทะเบียน
router.get('/transactions', clientDeviceAuth, publicClientRateLimit, async (req, res, next) => {
  try {
    res.json(await clientService.lookupTransaction(req.query, getClientContext(req)));
  } catch (error) {
    next(error);
  }
});

// Route ดึงรายการจอดด้วย transaction id
router.get('/transactions/:id', clientDeviceAuth, publicClientRateLimit, async (req, res, next) => {
  try {
    res.json(await clientService.getTransaction(String(req.params.id), req.query, getClientContext(req)));
  } catch (error) {
    next(error);
  }
});

// Route ดึงวิธีชำระที่เปิดใช้งานของช่องทางนั้น (kiosk/gate จาก device credentials ไม่มี deviceId คือ mobile)
router.get('/payments/methods', clientDeviceAuth, publicClientRateLimit, async (req, res, next) => {
  try {
    res.json(await clientService.getPaymentMethods(req.query, getClientContext(req)));
  } catch (error) {
    next(error);
  }
});

// Route บันทึกการรับบัตรผ่านเครื่อง EDC ของ Kiosk/Barrier Gate (ต้องมี device credentials)
router.post('/payments/edc', requireDeviceAuth(['kiosk', 'barrier_gate']), async (req, res, next) => {
  try {
    res.json(await clientService.payByEdc({ body: req.body, deviceId: req.deviceId, context: getClientContext(req) }));
  } catch (error) {
    next(error);
  }
});

// Route สร้าง Omise charge สำหรับ mobile/kiosk/barrier gate
router.post('/payments/charges', clientDeviceAuth, publicClientRateLimit, async (req, res, next) => {
  try {
    res.status(201).json(await clientService.createOmiseCharge({ body: req.body, deviceId: getClientDeviceId(req), context: getClientContext(req) }));
  } catch (error) {
    next(error);
  }
});

// Route ดึงรูป QR PromptPay ของ Omise charge
router.get('/payments/charges/:chargeId/qr', publicClientRateLimit, async (req, res, next) => {
  try {
    const image = await clientService.getOmiseQrImage({ chargeId: String(req.params.chargeId) });
    res.setHeader('Content-Type', image.contentType || 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(image.body);
  } catch (error) {
    next(error);
  }
});

// Route รับชำระเงินด้วย transactionId หรือ plateNo ใน body
router.post('/payments/test', clientDeviceAuth, publicClientRateLimit, async (req, res, next) => {
  try {
    res.json(await clientService.payTransaction({ body: req.body, deviceId: getClientDeviceId(req), context: getClientContext(req) }));
  } catch (error) {
    next(error);
  }
});

// Route SSE ของ kiosk, barrier gate และ mobile
router.get('/events', clientDeviceAuth, async (req, res, next) => {
  try {
    await sse.openClientEventStream(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
