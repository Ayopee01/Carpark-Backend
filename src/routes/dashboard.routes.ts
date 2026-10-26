// Import Library
import express from 'express';
// Import Middlewares
import { authorize, hasPermission } from '../middlewares/permission.middleware';
// Import Services
import * as dashboardService from '../services/dashboard.service';

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

export default router;
