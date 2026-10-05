// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as overviewService from '../services/overview.service';
// Import Realtime
import * as sse from '../realtime/sse';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('overview'));

// Route ดึงสรุป overview ตามช่วงวันที่
router.get('/', async (req, res, next) => {
  try {
    res.json(await overviewService.getOverviewSummary(req.query));
  } catch (error) {
    next(error);
  }
});

// Route SSE ของ overview ตามช่วงวันที่
router.get('/events', async (req, res, next) => {
  try {
    await sse.openOverviewEventStream(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
