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

// Mock เอกสาร app_config ตั้งต้น (pricing, payment settings, devices, theme, system settings)
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
  },
  {
    key: 'payment_settings',
    data: {
      methods: [
        { id: 'cash', label: 'Cash', icon: 'cash', isActive: true },
        { id: 'qr', label: 'QR Payment', icon: 'qr', isActive: true },
        { id: 'promptpay', label: 'PromptPay', icon: 'qr', isActive: true },
        { id: 'card', label: 'Credit/Debit Card', icon: 'card', isActive: true },
        { id: 'mobile_banking', label: 'Mobile Banking', icon: 'bank', isActive: true },
        { id: 'bank1', label: 'Bank Account 1', icon: 'bank', isActive: true },
        { id: 'wallet', label: 'Wallet', icon: 'wallet', isActive: true },
        { id: 'other', label: 'Other', icon: 'more', isActive: true }
      ],
      channels: [
        { id: 'ch_cashier', name: 'Cashier', icon: 'user', allowedMethods: ['cash', 'qr', 'promptpay', 'card', 'mobile_banking', 'bank1', 'wallet', 'other'] },
        { id: 'ch_kiosk', name: 'Kiosk', icon: 'vending', allowedMethods: ['qr', 'promptpay', 'card', 'mobile_banking', 'bank1', 'wallet'] },
        { id: 'ch_mobile', name: 'Mobile', icon: 'qr', allowedMethods: ['qr', 'promptpay', 'mobile_banking', 'wallet'] },
        { id: 'ch_gate', name: 'Exit Gate', icon: 'gate', allowedMethods: ['wallet', 'promptpay', 'card'] }
      ]
    }
  },
  {
    key: 'devices',
    data: {
      summary: { totalDevices: 0, online: 0, offline: 0 },
      devices: [],
      masterData: {
        deviceTypes: [
          { code: 'printer', label: 'Printer' },
          { code: 'lpr', label: 'LPR Camera' },
          { code: 'barrier_gate', label: 'Barrier Gate' },
          { code: 'kiosk', label: 'Kiosk' }
        ],
        connectionTypes: [
          { code: 'usb', label: 'USB' },
          { code: 'lan', label: 'LAN' },
          { code: 'wifi', label: 'Wi-Fi' }
        ]
      }
    }
  },
  {
    key: 'theme',
    data: {
      themeColor: null,
      logoUrl: null,
      themeMode: '',
      customThemeColor: null,
      updatedAt: '2026-10-05T00:00:00+07:00'
    }
  },
  {
    key: 'system_settings',
    data: {
      general: {
        systemName: 'Smart Carpark',
        location: 'Main Building',
        language: 'th',
        timezone: 'Asia/Bangkok',
        frontendUrl: 'http://localhost:3000'
      },
      receipt: {
        entryBill: { showDate: true, showEntryTime: true, showQrCode: true, showBillNo: true },
        paymentBill: { showDate: true, showEntryTime: true, showQrCode: true, showBillNo: true, showExpiryTime: true, expiryDuration: 30 },
        printer: { fontSize: 12, billNumberFontSize: 16, paperWidth: 80 },
        paperWidth: '80mm',
        footerText: 'Thank you'
      },
      billing: {
        taxEnabled: false,
        currency: 'THB',
        roundingMode: 'normal'
      },
      updatedAt: '2026-10-05T00:00:00+07:00'
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
