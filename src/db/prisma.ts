// Import Library
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
// Import Types
import type { DbClient } from '../types/shared/common.type';

/* -------------------------------------- Config -------------------------------------- */

// Config Prisma client กลางที่ทุก repository ใช้เชื่อมต่อ database (Prisma 7 ต่อ PostgreSQL ผ่าน driver adapter ของ pg)
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/* -------------------------------------- Functions -------------------------------------- */

// Function รันหลาย operation ใน database transaction เดียว ส่ง transaction client ให้ callback
function withTransaction<T>(callback: (connection: DbClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(callback);
}

export { prisma, withTransaction };
