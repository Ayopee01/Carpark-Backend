// Import Library
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/* -------------------------------------- Config -------------------------------------- */

// Config ของ Prisma CLI (migrate, seed, generate) ตั้งแต่ Prisma 7 ไม่อ่าน .env เองและไม่รับ url ใน schema
// ใช้ process.env แทน env() เพื่อให้ prisma generate ตอน docker build ทำงานได้โดยไม่มี DATABASE_URL
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
