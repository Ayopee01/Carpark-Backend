// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as paymentSettingsService from '../services/payment-settings.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('pricing'));

// Route ดึงรายการ payment method
router.get('/methods', async (_req, res, next) => {
  try {
    res.json(await paymentSettingsService.listMethods());
  } catch (error) {
    next(error);
  }
});

// Route แก้ไข payment method
router.patch('/methods/:id', async (req, res, next) => {
  try {
    res.json(await paymentSettingsService.updateMethod(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

// Route ลบ payment method
router.delete('/methods/:id', async (req, res, next) => {
  try {
    res.json(await paymentSettingsService.deleteMethod(req.params.id));
  } catch (error) {
    next(error);
  }
});

// Route ดึงรายการ payment channel
router.get('/channels', async (_req, res, next) => {
  try {
    res.json(await paymentSettingsService.listChannels());
  } catch (error) {
    next(error);
  }
});

// Route แก้ไข method ที่อนุญาตใน channel
router.patch('/channels/:id', async (req, res, next) => {
  try {
    res.json(await paymentSettingsService.updateChannel(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
});

// Route ลบ payment channel
router.delete('/channels/:id', async (req, res, next) => {
  try {
    res.json(await paymentSettingsService.deleteChannel(req.params.id));
  } catch (error) {
    next(error);
  }
});

export default router;
