// Import Library
import express from 'express';
// Import Middlewares
import { logoUpload } from '../middlewares/logo-upload.middleware';
import { authorize } from '../middlewares/permission.middleware';
// Import Services
import * as themeService from '../services/theme.service';

/* -------------------------------------- Routes -------------------------------------- */

const router = express.Router();

router.use(authorize('theme'));

// Route ดึง theme ปัจจุบัน
router.get('/', async (_req, res, next) => {
  try {
    res.json(await themeService.getTheme());
  } catch (error) {
    next(error);
  }
});

// Route แก้ไข theme
router.put('/', async (req, res, next) => {
  try {
    res.json(await themeService.updateTheme(req.body));
  } catch (error) {
    next(error);
  }
});

// Route upload logo จาก field "logo"
router.post('/logo', logoUpload, async (req, res, next) => {
  try {
    res.json(await themeService.uploadLogo(req.file));
  } catch (error) {
    next(error);
  }
});

// Route ลบ logo
router.delete('/logo', async (_req, res, next) => {
  try {
    res.json(await themeService.deleteLogo());
  } catch (error) {
    next(error);
  }
});

export default router;
