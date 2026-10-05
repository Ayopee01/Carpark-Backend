// Import Library
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as transactionsService from '../services/transactions.service';
// Import Realtime
import * as sse from '../realtime/sse';

/* -------------------------------------- Handlers -------------------------------------- */

// Function route handler รับ event จากกล้อง LPR ใช้ได้ทั้งกล้องที่มี device credentials และ Admin
async function handleCameraTransactionRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transactionsService.handleCameraTransaction(req.body, req.device);
    res.status(result.statusCode).json(result.body);
  } catch (error) {
    next(error);
  }
}

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('transactions'));

// Route ดึงรายการ transaction พร้อมค้นหาและ pagination
router.get('/', async (req, res, next) => {
  try {
    res.json(await transactionsService.listTransactions(req.query));
  } catch (error) {
    next(error);
  }
});

// Route SSE ของรายการ transaction
router.get('/events', async (req, res, next) => {
  try {
    await sse.openTransactionEventStream(req, res);
  } catch (error) {
    next(error);
  }
});

// Route รับ event จากกล้อง LPR โดย Admin
router.post('/', handleCameraTransactionRequest);

// Route ดึง transaction ล่าสุดจากทะเบียน (?exact=true หาเฉพาะทะเบียนที่ตรงทุกตัวอักษร)
router.get('/:plateNo', async (req, res, next) => {
  try {
    res.json(await transactionsService.getTransactionByPlateNo(req.params.plateNo, { exact: req.query.exact }));
  } catch (error) {
    next(error);
  }
});

// Route รับชำระเงินโดย Admin ด้วยทะเบียนใน path
router.post('/:plateNo/payment', async (req, res, next) => {
  try {
    res.json(await transactionsService.payTransactionByPlateNo(req.params.plateNo, req.body, req.user));
  } catch (error) {
    next(error);
  }
});

// Route แก้ไขข้อมูล transaction ล่าสุดของทะเบียน
router.patch('/:plateNo', async (req, res, next) => {
  try {
    res.json(await transactionsService.updateTransaction(req.params.plateNo, req.body));
  } catch (error) {
    next(error);
  }
});

// Route ลบ transaction ล่าสุดของทะเบียน
router.delete('/:plateNo', async (req, res, next) => {
  try {
    res.json(await transactionsService.deleteTransactionByPlateNo(req.params.plateNo));
  } catch (error) {
    next(error);
  }
});

export default router;
export { handleCameraTransactionRequest };
