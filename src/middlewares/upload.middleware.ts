// Import Library
import crypto from 'crypto';
import { fileTypeFromFile } from 'file-type';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
// Import Utils
import { ApiError } from '../utils/api-error';
import { UPLOAD_DIR } from '../utils/uploads';

/* -------------------------------------- Config -------------------------------------- */

// Config ข้อจำกัดไฟล์ logo ที่ upload ได้ (extensionTypes = นามสกุลที่รับ และนามสกุลที่ file-type ต้องตรวจเนื้อไฟล์ได้)
const LOGO_UPLOAD = {
  maxFileSize: 2 * 1024 * 1024,
  extensionTypes: { '.jpeg': 'jpg', '.jpg': 'jpg', '.png': 'png', '.webp': 'webp' } as Record<string, string>,
  allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
};

// Config ที่เก็บไฟล์ logo (สร้างโฟลเดอร์ตอน upload จริงเท่านั้น) และตั้งชื่อไฟล์ไม่ซ้ำ
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(UPLOAD_DIR, { recursive: true }, (err) => cb(err, UPLOAD_DIR));
  },
  filename: (_req, file, cb) => {
    cb(null, `logo-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`);
  },
});

// Config multer รับไฟล์รูป jpg/png/webp ขนาดไม่เกินที่กำหนด
const upload = multer({
  storage,
  limits: { fileSize: LOGO_UPLOAD.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const validExtension = Boolean(LOGO_UPLOAD.extensionTypes[path.extname(file.originalname).toLowerCase()]);
    const validMimeType = LOGO_UPLOAD.allowedMimeTypes.has(file.mimetype);
    if (validExtension && validMimeType) return cb(null, true);
    return cb(new ApiError(400, 'INVALID_LOGO_FILE', 'Only images (jpg, png, webp) are allowed!'));
  },
});

/* -------------------------------------- Helpers -------------------------------------- */

// Function ตรวจว่าเนื้อไฟล์เป็นรูปชนิดเดียวกับนามสกุล ถ้าไม่ตรงลบไฟล์ที่บันทึกไปแล้วและ throw INVALID_LOGO_FILE
async function assertLogoContent(file: Express.Multer.File): Promise<void> {
  const expectedType = LOGO_UPLOAD.extensionTypes[path.extname(file.originalname).toLowerCase()];
  try {
    // file-type อ่าน magic bytes ของเนื้อไฟล์จริง ไม่เชื่อนามสกุล/mimetype จาก client
    if (expectedType && (await fileTypeFromFile(file.path))?.ext === expectedType) return;
  } catch (err) {
    await fs.promises.rm(file.path, { force: true });
    throw err;
  }
  await fs.promises.rm(file.path, { force: true });
  throw new ApiError(400, 'INVALID_LOGO_FILE', 'Logo file content does not match a jpg, png or webp image');
}

/* -------------------------------------- Functions -------------------------------------- */

// Function middleware รับไฟล์ logo จาก field "logo" แปลง error ของ multer เป็น 400 แล้วตรวจเนื้อไฟล์ก่อนส่งต่อ
function logoUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('logo')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(new ApiError(400, 'INVALID_LOGO_FILE', err.message));
    if (err || !req.file) return next(err);
    assertLogoContent(req.file).then(() => next(), next);
  });
}

export { logoUpload };
