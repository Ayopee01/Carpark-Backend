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
    passwordHash: 'pbkdf2_sha256:100000:5a40e79f6ceb91d2acca809dd02b47da:7d36b58f1cf36742a0996c5e52da2ae1d5c056b84a44d3726f4059f6c5a323c7',
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
    passwordHash: 'pbkdf2_sha256:100000:5a40e79f6ceb91d2acca809dd02b47da:7d36b58f1cf36742a0996c5e52da2ae1d5c056b84a44d3726f4059f6c5a323c7',
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
    passwordHash: 'pbkdf2_sha256:100000:5a40e79f6ceb91d2acca809dd02b47da:7d36b58f1cf36742a0996c5e52da2ae1d5c056b84a44d3726f4059f6c5a323c7',
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
    passwordHash: 'pbkdf2_sha256:100000:a335b011289250a625450afe503da9e7:763a1a2cc79de02ab5507606e0ed680bb81ef1697c581f6a92ec5c4cfaf59f6e',
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
