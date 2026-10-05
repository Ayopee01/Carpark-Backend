// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as pricingService from '../services/pricing.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('pricing'));

// Route ดึง pricing rules
router.get('/', async (_req, res, next) => {
  try {
    res.json(await pricingService.getPricingRules());
  } catch (error) {
    next(error);
  }
});

// Route แก้ไข pricing config ทั้งชุด (เพิ่ม/แก้/ลบ rule ด้วยการส่ง pricingRules ทั้งชุด)
router.put('/', async (req, res, next) => {
  try {
    res.json(await pricingService.updatePricingConfig(req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
