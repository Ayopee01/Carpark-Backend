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

// Mock super admin บัญชีเดียวของระบบ ไว้ login ครั้งแรกเพื่อสร้างบัญชีพนักงานคนอื่น (เปลี่ยนรหัสทันทีหลัง seed บน production)
const superAdmin: Prisma.UserCreateInput = {
  id: 'u5',
  username: 'superadmin',
  passwordHash: 'pbkdf2_sha256:100000:a335b011289250a625450afe503da9e7:763a1a2cc79de02ab5507606e0ed680bb81ef1697c581f6a92ec5c4cfaf59f6e',
  name: 'Main Super Admin',
  email: 'superadmin@example.com',
  phone: '0800000005',
  role: 'super_admin',
  permissions: ['dashboard', 'transactions', 'overview', 'pricing', 'devices', 'theme', 'settings'],
  status: 'active'
};

/* -------------------------------------- Master Data -------------------------------------- */

// Mock ราคาตั้งต้น (settings อื่นใช้ค่า default ของ config.repository.ts จนกว่า Admin จะแก้)
const appConfigs: { key: string; data: Prisma.InputJsonValue }[] = [
  {
    key: 'pricing_config',
    data: {
      pricingRules: [
        { id: 'pr_car_base_hour', name: 'Car hours 1-2', feeType: 'base_hour', vehicleType: 'car', hourStart: 1, hourEnd: 2, baseHours: 2, price: 20, status: 'active' },
        { id: 'pr_car_next_hour', name: 'Car hours 3-24', feeType: 'next_hour', vehicleType: 'car', hourStart: 3, hourEnd: 24, price: 10, status: 'active' },
        { id: 'pr_car_overnight_day', name: 'Car overnight per midnight', feeType: 'overnight_day', vehicleType: 'car', price: 100, status: 'active' },
        { id: 'pr_motorcycle_base_hour', name: 'Motorcycle hours 1-2', feeType: 'base_hour', vehicleType: 'motorcycle', hourStart: 1, hourEnd: 2, baseHours: 2, price: 10, status: 'active' },
        { id: 'pr_motorcycle_next_hour', name: 'Motorcycle hours 3-24', feeType: 'next_hour', vehicleType: 'motorcycle', hourStart: 3, hourEnd: 24, price: 5, status: 'active' },
        { id: 'pr_motorcycle_overnight_day', name: 'Motorcycle overnight per midnight', feeType: 'overnight_day', vehicleType: 'motorcycle', price: 50, status: 'active' }
      ],
      paymentChannels: [
        { code: 'cash', label: 'Cash', enabled: true },
        { code: 'qr', label: 'QR Payment', enabled: true },
        { code: 'transfer', label: 'Bank Transfer', enabled: true },
        { code: 'wallet', label: 'Wallet', enabled: true }
      ],
      serviceChannelMapping: [
        { serviceType: 'parking', channelCodes: ['cash', 'qr', 'wallet'] },
        { serviceType: 'ev', channelCodes: ['qr', 'wallet'] },
        { serviceType: 'booking', channelCodes: ['qr', 'transfer'] }
      ],
      masterData: {
        serviceTypes: [
          { code: 'parking', label: 'Parking' }
        ],
        vehicleTypes: [
          { code: 'car', label: 'Car' },
          { code: 'motorcycle', label: 'Motorcycle' }
        ],
        feeTypes: [
          { code: 'base_hour', label: 'Base hour' },
          { code: 'next_hour', label: 'Next hour' },
          { code: 'overnight_day', label: 'Overnight per midnight' }
        ]
      }
    }
  }
];

/* -------------------------------------- Functions -------------------------------------- */

// Function seed หลักของระบบ ใช้ได้ทุก environment รวม production: สร้างเฉพาะที่ยังไม่มี รันซ้ำไม่ทับรหัสหรือ setting ที่แก้ไปแล้ว
async function main(): Promise<void> {
  await prisma.user.upsert({
    where: { id: superAdmin.id },
    create: superAdmin,
    update: {}
  });

  for (const config of appConfigs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      create: config,
      update: {}
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
