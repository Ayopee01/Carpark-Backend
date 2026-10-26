// Import Library
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

/* -------------------------------------- Config -------------------------------------- */

// Config Prisma client สำหรับ seed (ต้องมี DATABASE_URL ใน .env)
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/* -------------------------------------- Mock Data -------------------------------------- */

// Mock บัญชีพนักงานสำหรับทดสอบ (ใช้เฉพาะเครื่อง dev/ทดสอบ ห้ามรันบน production)
const admins: Prisma.UserCreateInput[] = [
  {
    id: 'u1',
    username: 'admin1',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$GTo2OARIVmj+QvAUKbyfoA$1vsvL/qV1qiMzfLDvYwlQMTJK7purgxvbFFXsThy5cQ',
    name: 'Admin One',
    email: 'admin1@example.com',
    phone: '0800000001',
    role: 'staff',
    permissions: ['dashboard', 'transactions', 'overview', 'pricing', 'devices', 'theme', 'settings'],
    status: 'active'
  },
  {
    id: 'u2',
    username: 'admin2',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$GTo2OARIVmj+QvAUKbyfoA$1vsvL/qV1qiMzfLDvYwlQMTJK7purgxvbFFXsThy5cQ',
    name: 'Admin Two',
    email: 'admin2@example.com',
    phone: '0800000002',
    role: 'staff',
    permissions: ['dashboard', 'transactions', 'overview'],
    status: 'active'
  },
  {
    id: 'u3',
    username: 'admin3',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$GTo2OARIVmj+QvAUKbyfoA$1vsvL/qV1qiMzfLDvYwlQMTJK7purgxvbFFXsThy5cQ',
    name: 'Admin Three',
    email: 'admin3@example.com',
    phone: '0800000003',
    role: 'staff',
    permissions: ['dashboard', 'transactions'],
    status: 'inactive'
  },
  {
    id: 'u4',
    username: 'cashier',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$MGYBgcH18fOKFnxlKqOCCw$FiJcIDKFcZ+VE7ZV2emB6xqgQ32FNavwRkOGMcOu+EA',
    name: 'Test Cashier',
    email: 'cashier@example.com',
    phone: '0800000004',
    role: 'staff',
    permissions: ['dashboard', 'transactions'],
    status: 'active'
  }
];

/* -------------------------------------- Functions -------------------------------------- */

// Function upsert บัญชีพนักงานทดสอบ รันซ้ำจะรีเซ็ตบัญชีเหล่านี้กลับเป็นค่าในไฟล์นี้
async function main(): Promise<void> {
  for (const admin of admins) {
    await prisma.user.upsert({
      where: { id: admin.id },
      create: admin,
      update: admin
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
