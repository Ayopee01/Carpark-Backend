// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
import { chargeVerifyRateLimit, socketTicketRateLimit } from '../middlewares/rate-limit.middleware';
// Import Services
import * as paymentsService from '../services/payments.service';
// Import Realtime
import * as sse from '../realtime/sse';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('transactions'));

// Route รายงานกระทบยอดการรับบัตรผ่านเครื่อง EDC แยกตามเครื่อง (date หรือ start_date/end_date ไม่เกิน 31 วัน)
router.get('/edc/reconciliation', async (req, res, next) => {
  try {
    res.json(await paymentsService.getEdcReconciliation(req.query));
  } catch (error) {
    next(error);
  }
});

// Route ดึงเครื่อง EDC ของเคาน์เตอร์ที่ใช้ได้ ให้พนักงานเลือกก่อนรับบัตร
router.get('/edc/terminals', async (_req, res, next) => {
  try {
    res.json(await paymentsService.listCashierEdcDevices());
  } catch (error) {
    next(error);
  }
});

// Route ดึงวิธีชำระที่เปิดใช้งานของ Admin (channel cashier)
router.get('/methods', async (_req, res, next) => {
  try {
    res.json(await paymentsService.listPaymentMethods());
  } catch (error) {
    next(error);
  }
});

// Route สร้าง Omise charge ของ Admin/Cashier
router.post('/charges', async (req, res, next) => {
  try {
    res.status(201).json(await paymentsService.createOmiseCharge(req.body, req.user));
  } catch (error) {
    next(error);
  }
});

// Route ดึงรูป QR PromptPay ของ charge ที่ Admin สร้าง
router.get('/charges/:chargeId/qr', async (req, res, next) => {
  try {
    const documentPath = typeof req.query.documentPath === 'string' ? req.query.documentPath : undefined;
    const image = await paymentsService.getOmiseQrImage({ chargeId: String(req.params.chargeId), documentPath });
    res.setHeader('Content-Type', image.contentType || 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(image.body);
  } catch (error) {
    next(error);
  }
});

// Route ตรวจสถานะ charge กับ Omise เมื่อพนักงานกด (สำรองเมื่อ webhook ไม่มา) จำกัด 1 ครั้งต่อ charge ทุก 10 วินาที
router.post('/charges/:chargeId/verify', chargeVerifyRateLimit, async (req, res, next) => {
  try {
    res.json(await paymentsService.verifyOmiseCharge(String(req.params.chargeId)));
  } catch (error) {
    next(error);
  }
});

// Route ออก ticket ใช้ครั้งเดียวให้ browser ต่อ WebSocket /api/payments/ws ของ chargeId (จำกัด 30 ครั้งต่อ user ต่อนาที)
router.post('/ws-ticket', socketTicketRateLimit, async (req, res, next) => {
  try {
    res.json(await paymentsService.createSocketTicket(req.body, req.user, req.sessionId));
  } catch (error) {
    next(error);
  }
});

// Route ดึงรายการเงินจาก Omise ที่ต้องคืน (เงินเข้าหลังรายการปิด หรือจ่ายเกินยอด)
router.get('/refunds', async (req, res, next) => {
  try {
    res.json(await paymentsService.listOmiseRefunds(req.query));
  } catch (error) {
    next(error);
  }
});

// Route SSE แจ้งเตือนรายการรอคืนเงินแบบ realtime ให้ Admin ทุกหน้า
router.get('/refunds/events', async (req, res, next) => {
  try {
    await sse.openRefundEventStream(req, res);
  } catch (error) {
    next(error);
  }
});

// Route บันทึกว่าคืนเงินของ charge แล้ว (PromptPay คืนผ่าน Omise ไม่ได้ ต้องคืนเงินสดหรือโอนเอง)
router.post('/refunds/:chargeId/resolve', async (req, res, next) => {
  try {
    res.json(await paymentsService.resolveOmiseRefund(req.params.chargeId, req.body, req.user));
  } catch (error) {
    next(error);
  }
});

export default router;
