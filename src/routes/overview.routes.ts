// Import Library
import express from 'express';
// Import Middlewares
import { authorize, hasPermission } from '../middlewares/permission.middleware';
// Import Services
import * as overviewService from '../services/overview.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('overview'));

// Route ดึงสรุป overview ตามช่วงวันที่ (include=edc_payments ส่งรายการบัตรทีละรายการของกระทบยอด EDC ด้วย)
router.get('/', async (req, res, next) => {
  try {
    res.json(await overviewService.getOverviewSummary(req.query, { includeTransactions: hasPermission(req.user, 'transactions') }));
  } catch (error) {
    next(error);
  }
});

export default router;
