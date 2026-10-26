// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
import { chargeVerifyRateLimit } from '../middlewares/rate-limit.middleware';
// Import Services
import * as paymentsService from '../services/payments.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('transactions'));

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
    const image = await paymentsService.getOmiseQrImage({ chargeId: String(req.params.chargeId), documentPath: req.query.documentPath });
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

// Route บันทึกว่าคืนเงินของ charge แล้ว (PromptPay คืนผ่าน Omise ไม่ได้ ต้องคืนเงินสดหรือโอนเอง)
router.post('/refunds/:chargeId/resolve', async (req, res, next) => {
  try {
    res.json(await paymentsService.resolveOmiseRefund(req.params.chargeId, req.body, req.user));
  } catch (error) {
    next(error);
  }
});

export default router;
