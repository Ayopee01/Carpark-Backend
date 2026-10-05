// Import Library
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
// Import Utils
import { ApiError } from '../utils/api-error';
import { UPLOAD_DIR } from '../utils/uploads';

/* -------------------------------------- Config -------------------------------------- */

// Config ข้อจำกัดไฟล์ logo ที่ upload ได้ (extensionTypes = นามสกุลที่รับ และชนิดรูปที่เนื้อไฟล์ต้องเป็น)
const LOGO_UPLOAD = {
  maxFileSize: 2 * 1024 * 1024,
  extensionTypes: { '.jpeg': 'jpeg', '.jpg': 'jpeg', '.png': 'png', '.webp': 'webp' } as Record<string, string>,
  allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
};

// Config magic bytes ของรูปแต่ละชนิด (ทุก part ต้องตรงที่ offset ของตัวเอง) ใช้ตรวจเนื้อไฟล์จริงแทนการเชื่อนามสกุล/mimetype จาก client
const IMAGE_SIGNATURES: { type: string; parts: { offset: number; bytes: number[] }[] }[] = [
  { type: 'jpeg', parts: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { type: 'png', parts: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  { type: 'webp', parts: [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }] },
];

// Config จำนวน bytes ต้นไฟล์ที่อ่านมาตรวจ magic bytes (พอสำหรับ signature ที่ยาวที่สุด)
const SIGNATURE_READ_BYTES = 12;

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

// Function อ่าน bytes ต้นไฟล์แล้วหาชนิดรูปจาก magic bytes (null = ไม่ใช่ jpg/png/webp)
async function detectImageType(filePath: string): Promise<string | null> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(SIGNATURE_READ_BYTES);
    const { bytesRead } = await handle.read(header, 0, SIGNATURE_READ_BYTES, 0);
    const matches = ({ offset, bytes }: { offset: number; bytes: number[] }): boolean =>
      offset + bytes.length <= bytesRead && bytes.every((byte, index) => header[offset + index] === byte);
    return IMAGE_SIGNATURES.find((signature) => signature.parts.every(matches))?.type ?? null;
  } finally {
    await handle.close();
  }
}

// Function ตรวจว่าเนื้อไฟล์เป็นรูปชนิดเดียวกับนามสกุล ถ้าไม่ตรงลบไฟล์ที่บันทึกไปแล้วและ throw INVALID_LOGO_FILE
async function assertLogoContent(file: Express.Multer.File): Promise<void> {
  const expectedType = LOGO_UPLOAD.extensionTypes[path.extname(file.originalname).toLowerCase()];
  try {
    if (expectedType && (await detectImageType(file.path)) === expectedType) return;
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
