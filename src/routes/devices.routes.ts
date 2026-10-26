// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as devicesService from '../services/devices.service';
// Import Realtime
import * as sse from '../realtime/sse';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('devices'));

// Route SSE ของสถานะอุปกรณ์และ devices config
router.get('/events', async (req, res, next) => {
  try {
    await sse.openDeviceEventStream(req, res);
  } catch (error) {
    next(error);
  }
});

// Route ดึงรายการอุปกรณ์พร้อม filter
router.get('/', async (req, res, next) => {
  try {
    res.json(await devicesService.listDevices(req.query));
  } catch (error) {
    next(error);
  }
});

// Route สร้างอุปกรณ์ตาม deviceType (kiosk/barrier_gate ได้ activation code, camera/printer ได้ deviceToken, edc ไม่มี token)
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await devicesService.createDevice(req.body));
  } catch (error) {
    next(error);
  }
});

// Route ออก activation code ใหม่ให้ kiosk/barrier gate เดิม
router.post('/:deviceId/activation-code', async (req, res, next) => {
  try {
    res.status(201).json(await devicesService.reissueActivationCode(req.params.deviceId));
  } catch (error) {
    next(error);
  }
});

// Route แก้ไขข้อมูลหรือ mapping ของอุปกรณ์
router.put('/:deviceId', async (req, res, next) => {
  try {
    res.json(await devicesService.updateDevice(req.params.deviceId, req.body));
  } catch (error) {
    next(error);
  }
});

// Route ผูกกล้องหนึ่งตัวกับ Barrier Gate (ไม่ต้องส่ง cameraIds ทั้งชุด)
router.put('/:deviceId/cameras/:cameraId', async (req, res, next) => {
  try {
    res.json(await devicesService.changeDeviceMapping(req.params.deviceId, 'cameraIds', req.params.cameraId, 'add'));
  } catch (error) {
    next(error);
  }
});

// Route ถอดกล้องหนึ่งตัวออกจาก Barrier Gate
router.delete('/:deviceId/cameras/:cameraId', async (req, res, next) => {
  try {
    res.json(await devicesService.changeDeviceMapping(req.params.deviceId, 'cameraIds', req.params.cameraId, 'remove'));
  } catch (error) {
    next(error);
  }
});

// Route ผูก printer หนึ่งตัวกับ Kiosk/Barrier Gate
router.put('/:deviceId/printers/:printerId', async (req, res, next) => {
  try {
    res.json(await devicesService.changeDeviceMapping(req.params.deviceId, 'printerIds', req.params.printerId, 'add'));
  } catch (error) {
    next(error);
  }
});

// Route ถอด printer หนึ่งตัวออกจาก Kiosk/Barrier Gate
router.delete('/:deviceId/printers/:printerId', async (req, res, next) => {
  try {
    res.json(await devicesService.changeDeviceMapping(req.params.deviceId, 'printerIds', req.params.printerId, 'remove'));
  } catch (error) {
    next(error);
  }
});

// Route ลบอุปกรณ์
router.delete('/:deviceId', async (req, res, next) => {
  try {
    res.json(await devicesService.deleteDevice(req.params.deviceId));
  } catch (error) {
    next(error);
  }
});

export default router;
