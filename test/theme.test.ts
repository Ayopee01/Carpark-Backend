// Import Library
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
// Import Test Helpers
import { stub } from './support/mock';
// Import Middlewares
import { errorHandler } from '../src/middlewares/error.middleware';
import { logoUpload } from '../src/middlewares/logo-upload.middleware';
// Import Repositories
import * as configRepository from '../src/repositories/config.repository';
// Import Services
import * as themeService from '../src/services/theme.service';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Config เนื้อไฟล์ PNG ที่มี magic bytes ถูกต้อง
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

// Function เปิด server ที่มีแค่ logoUpload middleware คืน url และ path ของไฟล์ที่ผ่าน (ลบไฟล์และปิด server ตอนจบ test)
async function startLogoServer(t: TestContext): Promise<{ url: string; savedPaths: string[] }> {
  const savedPaths: string[] = [];
  const app = express();
  app.post('/logo', logoUpload, (req, res) => {
    if (req.file) savedPaths.push(req.file.path);
    res.json({ ok: true });
  });
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => {
    savedPaths.forEach((filePath) => fs.rmSync(filePath, { force: true }));
    server.close();
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/logo`, savedPaths };
}

// Function ส่งไฟล์ใน field logo แบบ multipart แล้วคืน status และ body
async function postLogo(url: string, content: Buffer, filename: string, type: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  form.append('logo', new Blob([new Uint8Array(content)], { type }), filename);
  const res = await fetch(url, { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/* -------------------------------------- Logo Upload Tests -------------------------------------- */

test('logo upload accepts a file whose content matches its image extension', async (t) => {
  const { url, savedPaths } = await startLogoServer(t);

  const result = await postLogo(url, PNG_BYTES, 'logo.png', 'image/png');

  assert.equal(result.status, 200);
  assert.equal(savedPaths.length, 1);
});

test('logo upload rejects a renamed file by its content and deletes the saved file', async (t) => {
  const { url, savedPaths } = await startLogoServer(t);
  const fake = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const before = fs.existsSync('uploads') ? fs.readdirSync('uploads').length : 0;

  // ไฟล์ข้อความที่ตั้งนามสกุล .png และ mimetype image/png ผ่าน fileFilter แต่เนื้อไฟล์ไม่ใช่ PNG
  const renamed = await postLogo(url, fake, 'logo.png', 'image/png');
  // PNG จริงแต่ตั้งนามสกุล .jpg ก็ไม่ผ่าน เพราะชนิดเนื้อไฟล์ต้องตรงกับนามสกุล
  const mismatched = await postLogo(url, PNG_BYTES, 'logo.jpg', 'image/jpeg');

  for (const result of [renamed, mismatched]) {
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_LOGO_FILE');
    assert.equal(result.body.message, 'Logo file content does not match a jpg, png or webp image');
  }
  assert.equal(savedPaths.length, 0);
  assert.equal(fs.existsSync('uploads') ? fs.readdirSync('uploads').length : 0, before);
});

/* -------------------------------------- Theme Tests -------------------------------------- */

test('updateTheme accepts only null or an /uploads/ path as logoUrl', async (t) => {
  stub(t, configRepository, {
    getConfig: async () => ({ themeColor: null, logoUrl: null, themeMode: '', customThemeColor: null }),
    setConfig: async (_key, value) => ({ ...value, configUpdatedAt: null }),
  });

  for (const logoUrl of ['https://evil.example/logo.png', '/uploads/../.env', '/uploads/.hidden', '']) {
    await assert.rejects(themeService.updateTheme({ logoUrl }), (error: { code: string; details: { errors: { field: string }[] } }) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.details.errors[0]?.field, 'logoUrl');
      return true;
    });
  }
  assert.equal((await themeService.updateTheme({ logoUrl: '/uploads/logo-1-ab.png' })).theme.logoUrl, '/uploads/logo-1-ab.png');
  assert.equal((await themeService.updateTheme({ logoUrl: null })).theme.logoUrl, null);
});
