// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as dashboardService from '../services/dashboard.service';
// Import Realtime
import * as sse from '../realtime/sse';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('dashboard'));

// Route ดึงสรุป dashboard ของวันนี้
router.get('/', async (_req, res, next) => {
  try {
    res.json(await dashboardService.getDashboardSummary());
  } catch (error) {
    next(error);
  }
});

// Route SSE ของ dashboard summary
router.get('/events', async (req, res, next) => {
  try {
    await sse.openDashboardEventStream(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
