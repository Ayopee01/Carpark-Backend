// Import Library
import express from 'express';
// Import Middlewares
import { authorize, hasPermission } from '../middlewares/permission.middleware';
// Import Services
import * as dashboardService from '../services/dashboard.service';
// Import Realtime
import * as sse from '../realtime/sse';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

// Route ดึงสรุป dashboard ของวันนี้ (refunds เป็น null ถ้าไม่มีสิทธิ์ transactions)
router.get('/', authorize('dashboard'), async (req, res, next) => {
  try {
    res.json(await dashboardService.getDashboardSummary({ includeRefunds: hasPermission(req.user, 'transactions') }));
  } catch (error) {
    next(error);
  }
});

// Route SSE ของ dashboard summary และแจ้งเตือนคืนเงินของทุกหน้า (มีสิทธิ์ dashboard หรือ transactions อย่างใดอย่างหนึ่ง)
router.get('/events', authorize(['dashboard', 'transactions']), async (req, res, next) => {
  try {
    await sse.openDashboardEventStream(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
