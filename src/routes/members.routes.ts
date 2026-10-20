// Import Library
import express from 'express';
// Import Middlewares
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as membersService from '../services/members.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('settings'));

// Route ดึงรายการ member พร้อม filter
router.get('/', async (req, res, next) => {
  try {
    res.json(await membersService.listMembers(req.query));
  } catch (error) {
    next(error);
  }
});

// Route สร้าง member ใหม่
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await membersService.createMember(req.body, req.user));
  } catch (error) {
    next(error);
  }
});

// Route แก้ไขข้อมูล member
router.patch('/:id', async (req, res, next) => {
  try {
    res.json(await membersService.updateMember(req.params.id, req.body, { user: req.user, sessionId: req.sessionId }));
  } catch (error) {
    next(error);
  }
});

// Route ลบ member
router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await membersService.deleteMember(req.params.id, { user: req.user }));
  } catch (error) {
    next(error);
  }
});

export default router;
