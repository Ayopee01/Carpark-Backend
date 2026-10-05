// Import Library
import express from 'express';
// Import Services
import * as paymentGatewayService from '../services/payment-gateway.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

// Route รับ webhook จาก Omise เมื่อสถานะ charge เปลี่ยน
router.post('/omise/webhook', async (req, res, next) => {
  try {
    res.json(await paymentGatewayService.handleOmiseWebhook({ rawBody: req.rawBody, headers: req.headers, body: req.body }));
  } catch (error) {
    next(error);
  }
});

// Route จำลอง Omise charge จ่ายสำเร็จสำหรับ UAT
router.post('/omise/simulate-paid', async (req, res, next) => {
  try {
    res.json(await paymentGatewayService.simulatePaid({ token: req.get('x-simulation-token'), body: req.body }));
  } catch (error) {
    next(error);
  }
});

export default router;
