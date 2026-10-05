// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as systemSettingsService from '../services/system-settings.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('settings'));

// Route ดึง system settings ทั้งหมด
router.get('/', async (_req, res, next) => {
  try {
    res.json(await systemSettingsService.getSystemSettings());
  } catch (error) {
    next(error);
  }
});

// Route แก้ไข system settings
router.put('/', async (req, res, next) => {
  try {
    res.json(await systemSettingsService.updateSystemSettings(req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
