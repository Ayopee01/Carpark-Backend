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

// ข้อมูลรถสำหรับทดสอบ (ใช้เฉพาะเครื่อง dev/ทดสอบ ห้ามรันบน production) ย้อนหลัง 3 เดือนจากวันนี้ 5 ต.ค. 2026
// ค่าจอดคำนวณตาม pricing_config ใน seed.ts และวันที่เป็นเวลาไทย (+07:00)

// Mock ข้อมูลรถเดือนกรกฎาคม 2026 (5 - 31 ก.ค. ย้อนหลัง 3 เดือนจากวันนี้) 51 รายการ
const july2026: Prisma.TransactionCreateInput[] = [
  {
    "id": "t_seed_0001",
    "billNo": "PK20260705-073900-0001",
    "plateNo": "9รล1490",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-05T07:39:00+07:00",
    "exitAt": "2026-07-05T12:37:00+07:00",
    "exitTimeLimit": "2026-07-05T12:58:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0001", "method": "promptpay", "channel": "mobile", "paidAmount": 70, "paidAt": "2026-07-05T12:28:00+07:00", "expiryAt": "2026-07-05T12:58:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-05T07:39:00+07:00",
    "updatedAt": "2026-07-05T12:37:00+07:00"
  },
  {
    "id": "t_seed_0002",
    "billNo": "PK20260705-123100-0002",
    "plateNo": "2บย7786",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-05T12:31:00+07:00",
    "exitAt": "2026-07-05T13:14:00+07:00",
    "exitTimeLimit": "2026-07-05T13:31:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0002", "method": "promptpay", "channel": "kiosk", "paidAmount": 20, "paidAt": "2026-07-05T13:01:00+07:00", "expiryAt": "2026-07-05T13:31:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-05T12:31:00+07:00",
    "updatedAt": "2026-07-05T13:14:00+07:00"
  },
  {
    "id": "t_seed_0003",
    "billNo": "PK20260706-204700-0003",
    "plateNo": "1ฒท293",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-06T20:47:00+07:00",
    "exitAt": "2026-07-06T21:18:00+07:00",
    "exitTimeLimit": "2026-07-06T21:31:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0003", "method": "promptpay", "channel": "mobile", "paidAmount": 10, "paidAt": "2026-07-06T21:01:00+07:00", "expiryAt": "2026-07-06T21:31:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-06T20:47:00+07:00",
    "updatedAt": "2026-07-06T21:18:00+07:00"
  },
  {
    "id": "t_seed_0004",
    "billNo": "PK20260706-195700-0004",
    "plateNo": "1คง319",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-06T19:57:00+07:00",
    "exitAt": "2026-07-06T21:30:00+07:00",
    "exitTimeLimit": "2026-07-06T21:44:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0004", "method": "promptpay", "channel": "kiosk", "paidAmount": 20, "paidAt": "2026-07-06T21:14:00+07:00", "expiryAt": "2026-07-06T21:44:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-06T19:57:00+07:00",
    "updatedAt": "2026-07-06T21:30:00+07:00"
  },
  {
    "id": "t_seed_0005",
    "billNo": "PK20260706-092700-0005",
    "plateNo": "7บย5234",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-06T09:27:00+07:00",
    "exitAt": "2026-07-06T13:09:00+07:00",
    "exitTimeLimit": "2026-07-06T13:25:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0005", "method": "cash", "channel": "cashier", "paidAmount": 60, "paidAt": "2026-07-06T12:55:00+07:00", "expiryAt": "2026-07-06T13:25:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-07-06T09:27:00+07:00",
    "updatedAt": "2026-07-06T13:09:00+07:00"
  },
  {
    "id": "t_seed_0006",
    "billNo": "PK20260707-084900-0006",
    "plateNo": "4ฮก7799",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-07T08:49:00+07:00",
    "exitAt": "2026-07-07T14:47:00+07:00",
    "exitTimeLimit": "2026-07-07T15:11:00+07:00",
    "amount": 80,
    "netAmount": 80,
    "totalPaid": 80,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0006", "method": "promptpay", "channel": "kiosk", "paidAmount": 80, "paidAt": "2026-07-07T14:41:00+07:00", "expiryAt": "2026-07-07T15:11:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-07T08:49:00+07:00",
    "updatedAt": "2026-07-07T14:47:00+07:00"
  },
  {
    "id": "t_seed_0007",
    "billNo": "PK20260708-160800-0007",
    "plateNo": "1กข190",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-08T16:08:00+07:00",
    "exitAt": "2026-07-08T20:10:00+07:00",
    "exitTimeLimit": "2026-07-08T20:22:00+07:00",
    "amount": 30,
    "netAmount": 30,
    "totalPaid": 30,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0007", "method": "promptpay", "channel": "mobile", "paidAmount": 30, "paidAt": "2026-07-08T19:52:00+07:00", "expiryAt": "2026-07-08T20:22:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-08T16:08:00+07:00",
    "updatedAt": "2026-07-08T20:10:00+07:00"
  },
  {
    "id": "t_seed_0008",
    "billNo": "PK20260708-070100-0008",
    "plateNo": "6รล3564",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-08T07:01:00+07:00",
    "exitAt": "2026-07-08T11:23:00+07:00",
    "exitTimeLimit": "2026-07-08T11:37:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0008", "method": "cash", "channel": "cashier", "paidAmount": 70, "paidAt": "2026-07-08T11:07:00+07:00", "expiryAt": "2026-07-08T11:37:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-07-08T07:01:00+07:00",
    "updatedAt": "2026-07-08T11:23:00+07:00"
  },
  {
    "id": "t_seed_0009",
    "billNo": "PK20260708-070000-0009",
    "plateNo": "2งจ9817",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-08T07:00:00+07:00",
    "exitAt": "2026-07-08T15:43:00+07:00",
    "exitTimeLimit": "2026-07-08T15:43:00+07:00",
    "amount": 110,
    "netAmount": 110,
    "totalPaid": 110,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0009", "method": "promptpay", "channel": "gate", "paidAmount": 110, "paidAt": "2026-07-08T15:43:00+07:00", "expiryAt": "2026-07-08T15:43:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-08T07:00:00+07:00",
    "updatedAt": "2026-07-08T15:43:00+07:00"
  },
  {
    "id": "t_seed_0010",
    "billNo": "PK20260709-164300-0010",
    "plateNo": "3บย9229",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-09T16:43:00+07:00",
    "exitAt": "2026-07-09T17:38:00+07:00",
    "exitTimeLimit": "2026-07-09T18:03:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0010", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-07-09T17:33:00+07:00", "expiryAt": "2026-07-09T18:03:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-07-09T16:43:00+07:00",
    "updatedAt": "2026-07-09T17:38:00+07:00"
  },
  {
    "id": "t_seed_0011",
    "billNo": "PK20260710-103500-0011",
    "plateNo": "9ขก8546",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-10T10:35:00+07:00",
    "exitAt": "2026-07-10T11:41:00+07:00",
    "exitTimeLimit": "2026-07-10T11:41:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0011", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-07-10T11:41:00+07:00", "expiryAt": "2026-07-10T11:41:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-10T10:35:00+07:00",
    "updatedAt": "2026-07-10T11:41:00+07:00"
  },
  {
    "id": "t_seed_0012",
    "billNo": "PK20260710-064500-0012",
    "plateNo": "7กข9877",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-10T06:45:00+07:00",
    "exitAt": "2026-07-10T07:56:00+07:00",
    "exitTimeLimit": "2026-07-10T08:17:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0012", "method": "promptpay", "channel": "mobile", "paidAmount": 40, "paidAt": "2026-07-10T07:47:00+07:00", "expiryAt": "2026-07-10T08:17:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-10T06:45:00+07:00",
    "updatedAt": "2026-07-10T07:56:00+07:00"
  },
  {
    "id": "t_seed_0013",
    "billNo": "PK20260710-160700-0013",
    "plateNo": "9รล9853",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-10T16:07:00+07:00",
    "exitAt": "2026-07-10T18:06:00+07:00",
    "exitTimeLimit": "2026-07-10T18:21:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0013", "method": "cash", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-07-10T17:51:00+07:00", "expiryAt": "2026-07-10T18:21:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-07-10T16:07:00+07:00",
    "updatedAt": "2026-07-10T18:06:00+07:00"
  },
  {
    "id": "t_seed_0014",
    "billNo": "PK20260712-153200-0014",
    "plateNo": "1คง1417",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-12T15:32:00+07:00",
    "exitAt": "2026-07-12T16:17:00+07:00",
    "exitTimeLimit": "2026-07-12T16:37:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0014", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-07-12T16:07:00+07:00", "expiryAt": "2026-07-12T16:37:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-07-12T15:32:00+07:00",
    "updatedAt": "2026-07-12T16:17:00+07:00"
  },
  {
    "id": "t_seed_0015",
    "billNo": "PK20260712-145800-0015",
    "plateNo": "9ขก8546",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-12T14:58:00+07:00",
    "exitAt": "2026-07-12T15:29:00+07:00",
    "exitTimeLimit": "2026-07-12T15:29:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0015", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-07-12T15:29:00+07:00", "expiryAt": "2026-07-12T15:29:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-12T14:58:00+07:00",
    "updatedAt": "2026-07-12T15:29:00+07:00"
  },
  {
    "id": "t_seed_0016",
    "billNo": "PK20260713-172900-0016",
    "plateNo": "4ฮก7799",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-13T17:29:00+07:00",
    "exitAt": "2026-07-13T23:17:00+07:00",
    "exitTimeLimit": "2026-07-13T23:17:00+07:00",
    "amount": 80,
    "netAmount": 80,
    "totalPaid": 80,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0016", "method": "promptpay", "channel": "gate", "paidAmount": 80, "paidAt": "2026-07-13T23:17:00+07:00", "expiryAt": "2026-07-13T23:17:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-13T17:29:00+07:00",
    "updatedAt": "2026-07-13T23:17:00+07:00"
  },
  {
    "id": "t_seed_0017",
    "billNo": "PK20260713-193000-0017",
    "plateNo": "3งจ1487",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-13T19:30:00+07:00",
    "exitAt": "2026-07-13T20:49:00+07:00",
    "exitTimeLimit": "2026-07-13T20:49:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0017", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-07-13T20:49:00+07:00", "expiryAt": "2026-07-13T20:49:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-13T19:30:00+07:00",
    "updatedAt": "2026-07-13T20:49:00+07:00"
  },
  {
    "id": "t_seed_0018",
    "billNo": "PK20260713-143500-0018",
    "plateNo": "6ฮก2759",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-13T14:35:00+07:00",
    "exitAt": "2026-07-13T16:44:00+07:00",
    "exitTimeLimit": "2026-07-13T16:44:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0018", "method": "promptpay", "channel": "gate", "paidAmount": 50, "paidAt": "2026-07-13T16:44:00+07:00", "expiryAt": "2026-07-13T16:44:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-13T14:35:00+07:00",
    "updatedAt": "2026-07-13T16:44:00+07:00"
  },
  {
    "id": "t_seed_0019",
    "billNo": "PK20260714-123200-0019",
    "plateNo": "2งจ905",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-14T12:32:00+07:00",
    "exitAt": "2026-07-14T13:00:00+07:00",
    "exitTimeLimit": "2026-07-14T13:19:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0019", "method": "promptpay", "channel": "kiosk", "paidAmount": 10, "paidAt": "2026-07-14T12:49:00+07:00", "expiryAt": "2026-07-14T13:19:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-14T12:32:00+07:00",
    "updatedAt": "2026-07-14T13:00:00+07:00"
  },
  {
    "id": "t_seed_0020",
    "billNo": "PK20260714-164100-0020",
    "plateNo": "4วศ7277",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-14T16:41:00+07:00",
    "exitAt": "2026-07-14T19:46:00+07:00",
    "exitTimeLimit": "2026-07-14T20:03:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0020", "method": "promptpay", "channel": "mobile", "paidAmount": 50, "paidAt": "2026-07-14T19:33:00+07:00", "expiryAt": "2026-07-14T20:03:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-14T16:41:00+07:00",
    "updatedAt": "2026-07-14T19:46:00+07:00"
  },
  {
    "id": "t_seed_0021",
    "billNo": "PK20260715-142700-0021",
    "plateNo": "3ฉช9505",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-15T14:27:00+07:00",
    "exitAt": "2026-07-15T20:10:00+07:00",
    "exitTimeLimit": "2026-07-15T20:36:00+07:00",
    "amount": 80,
    "netAmount": 80,
    "totalPaid": 80,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0021", "method": "promptpay", "channel": "mobile", "paidAmount": 80, "paidAt": "2026-07-15T20:06:00+07:00", "expiryAt": "2026-07-15T20:36:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-15T14:27:00+07:00",
    "updatedAt": "2026-07-15T20:10:00+07:00"
  },
  {
    "id": "t_seed_0022",
    "billNo": "PK20260716-110900-0022",
    "plateNo": "1บย6955",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-16T11:09:00+07:00",
    "status": "cancelled",
    "payments": [],
    "createdAt": "2026-07-16T11:09:00+07:00",
    "updatedAt": "2026-07-16T11:29:00+07:00"
  },
  {
    "id": "t_seed_0023",
    "billNo": "PK20260716-180300-0023",
    "plateNo": "4วศ7277",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-16T18:03:00+07:00",
    "exitAt": "2026-07-16T20:44:00+07:00",
    "exitTimeLimit": "2026-07-16T20:44:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0022", "method": "promptpay", "channel": "kiosk", "paidAmount": 20, "paidAt": "2026-07-16T18:41:00+07:00", "expiryAt": "2026-07-16T19:11:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"},
      {"id": "pay_seed_0023", "method": "promptpay", "channel": "gate", "paidAmount": 30, "paidAt": "2026-07-16T20:44:00+07:00", "expiryAt": "2026-07-16T20:44:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-16T18:03:00+07:00",
    "updatedAt": "2026-07-16T20:44:00+07:00"
  },
  {
    "id": "t_seed_0024",
    "billNo": "PK20260716-074500-0024",
    "plateNo": "4กค7925",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-16T07:45:00+07:00",
    "exitAt": "2026-07-16T11:26:00+07:00",
    "exitTimeLimit": "2026-07-16T11:26:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0024", "method": "cash", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-07-16T09:26:00+07:00", "expiryAt": "2026-07-16T09:56:00+07:00", "source": "admin", "processedBy": "u2"},
      {"id": "pay_seed_0025", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-07-16T11:26:00+07:00", "expiryAt": "2026-07-16T11:26:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-16T07:45:00+07:00",
    "updatedAt": "2026-07-16T11:26:00+07:00"
  },
  {
    "id": "t_seed_0025",
    "billNo": "PK20260717-085900-0025",
    "plateNo": "3ฉช9505",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-17T08:59:00+07:00",
    "exitAt": "2026-07-17T11:31:00+07:00",
    "exitTimeLimit": "2026-07-17T11:47:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0026", "method": "cash", "channel": "cashier", "paidAmount": 50, "paidAt": "2026-07-17T11:17:00+07:00", "expiryAt": "2026-07-17T11:47:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-07-17T08:59:00+07:00",
    "updatedAt": "2026-07-17T11:31:00+07:00"
  },
  {
    "id": "t_seed_0026",
    "billNo": "PK20260717-110000-0026",
    "plateNo": "4วศ7277",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-17T11:00:00+07:00",
    "exitAt": "2026-07-17T15:50:00+07:00",
    "exitTimeLimit": "2026-07-17T15:50:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0027", "method": "promptpay", "channel": "gate", "paidAmount": 70, "paidAt": "2026-07-17T15:50:00+07:00", "expiryAt": "2026-07-17T15:50:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-17T11:00:00+07:00",
    "updatedAt": "2026-07-17T15:50:00+07:00"
  },
  {
    "id": "t_seed_0027",
    "billNo": "PK20260717-084400-0027",
    "plateNo": "9ขก8546",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-17T08:44:00+07:00",
    "exitAt": "2026-07-17T15:40:00+07:00",
    "exitTimeLimit": "2026-07-17T15:58:00+07:00",
    "amount": 90,
    "netAmount": 90,
    "totalPaid": 90,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0028", "method": "promptpay", "channel": "kiosk", "paidAmount": 90, "paidAt": "2026-07-17T15:28:00+07:00", "expiryAt": "2026-07-17T15:58:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-17T08:44:00+07:00",
    "updatedAt": "2026-07-17T15:40:00+07:00"
  },
  {
    "id": "t_seed_0028",
    "billNo": "PK20260718-174900-0028",
    "plateNo": "2บย7786",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-18T17:49:00+07:00",
    "exitAt": "2026-07-18T21:23:00+07:00",
    "exitTimeLimit": "2026-07-18T21:47:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0029", "method": "promptpay", "channel": "kiosk", "paidAmount": 60, "paidAt": "2026-07-18T21:17:00+07:00", "expiryAt": "2026-07-18T21:47:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-18T17:49:00+07:00",
    "updatedAt": "2026-07-18T21:23:00+07:00"
  },
  {
    "id": "t_seed_0029",
    "billNo": "PK20260719-075900-0029",
    "plateNo": "3ฉช463",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-19T07:59:00+07:00",
    "exitAt": "2026-07-19T08:30:00+07:00",
    "exitTimeLimit": "2026-07-19T08:45:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0030", "method": "promptpay", "channel": "kiosk", "paidAmount": 10, "paidAt": "2026-07-19T08:15:00+07:00", "expiryAt": "2026-07-19T08:45:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-19T07:59:00+07:00",
    "updatedAt": "2026-07-19T08:30:00+07:00"
  },
  {
    "id": "t_seed_0030",
    "billNo": "PK20260719-203300-0030",
    "plateNo": "1บย6955",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-19T20:33:00+07:00",
    "exitAt": "2026-07-20T02:00:00+07:00",
    "exitTimeLimit": "2026-07-20T02:12:00+07:00",
    "amount": 200,
    "netAmount": 200,
    "totalPaid": 200,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0031", "method": "promptpay", "channel": "mobile", "paidAmount": 200, "paidAt": "2026-07-20T01:42:00+07:00", "expiryAt": "2026-07-20T02:12:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-19T20:33:00+07:00",
    "updatedAt": "2026-07-20T02:00:00+07:00"
  },
  {
    "id": "t_seed_0031",
    "billNo": "PK20260720-164900-0031",
    "plateNo": "9ขก8546",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-20T16:49:00+07:00",
    "exitAt": "2026-07-21T02:27:00+07:00",
    "exitTimeLimit": "2026-07-21T02:27:00+07:00",
    "amount": 250,
    "netAmount": 250,
    "totalPaid": 250,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0032", "method": "cash", "channel": "cashier", "paidAmount": 240, "paidAt": "2026-07-21T01:12:00+07:00", "expiryAt": "2026-07-21T01:42:00+07:00", "source": "admin", "processedBy": "u1"},
      {"id": "pay_seed_0033", "method": "promptpay", "channel": "gate", "paidAmount": 10, "paidAt": "2026-07-21T02:27:00+07:00", "expiryAt": "2026-07-21T02:27:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-20T16:49:00+07:00",
    "updatedAt": "2026-07-21T02:27:00+07:00"
  },
  {
    "id": "t_seed_0032",
    "billNo": "PK20260720-173300-0032",
    "plateNo": "8ฉช8943",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-20T17:33:00+07:00",
    "exitAt": "2026-07-21T05:19:00+07:00",
    "exitTimeLimit": "2026-07-21T05:31:00+07:00",
    "amount": 270,
    "netAmount": 270,
    "totalPaid": 270,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0034", "method": "promptpay", "channel": "kiosk", "paidAmount": 270, "paidAt": "2026-07-21T05:01:00+07:00", "expiryAt": "2026-07-21T05:31:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-20T17:33:00+07:00",
    "updatedAt": "2026-07-21T05:19:00+07:00"
  },
  {
    "id": "t_seed_0033",
    "billNo": "PK20260721-095200-0033",
    "plateNo": "5กข538",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-21T09:52:00+07:00",
    "exitAt": "2026-07-21T12:51:00+07:00",
    "exitTimeLimit": "2026-07-21T13:17:00+07:00",
    "amount": 25,
    "netAmount": 25,
    "totalPaid": 25,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0035", "method": "promptpay", "channel": "kiosk", "paidAmount": 25, "paidAt": "2026-07-21T12:47:00+07:00", "expiryAt": "2026-07-21T13:17:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-21T09:52:00+07:00",
    "updatedAt": "2026-07-21T12:51:00+07:00"
  },
  {
    "id": "t_seed_0034",
    "billNo": "PK20260722-063800-0034",
    "plateNo": "9รล1490",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-22T06:38:00+07:00",
    "exitAt": "2026-07-22T07:27:00+07:00",
    "exitTimeLimit": "2026-07-22T07:49:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0036", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-07-22T07:19:00+07:00", "expiryAt": "2026-07-22T07:49:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-22T06:38:00+07:00",
    "updatedAt": "2026-07-22T07:27:00+07:00"
  },
  {
    "id": "t_seed_0035",
    "billNo": "PK20260722-073200-0035",
    "plateNo": "2งจ9817",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-22T07:32:00+07:00",
    "exitAt": "2026-07-22T10:24:00+07:00",
    "exitTimeLimit": "2026-07-22T10:43:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0037", "method": "promptpay", "channel": "mobile", "paidAmount": 50, "paidAt": "2026-07-22T10:13:00+07:00", "expiryAt": "2026-07-22T10:43:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-22T07:32:00+07:00",
    "updatedAt": "2026-07-22T10:24:00+07:00"
  },
  {
    "id": "t_seed_0036",
    "billNo": "PK20260722-161400-0036",
    "plateNo": "2ฮก3887",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-22T16:14:00+07:00",
    "exitAt": "2026-07-22T17:34:00+07:00",
    "exitTimeLimit": "2026-07-22T17:59:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0038", "method": "promptpay", "channel": "kiosk", "paidAmount": 40, "paidAt": "2026-07-22T17:29:00+07:00", "expiryAt": "2026-07-22T17:59:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-22T16:14:00+07:00",
    "updatedAt": "2026-07-22T17:34:00+07:00"
  },
  {
    "id": "t_seed_0037",
    "billNo": "PK20260723-191100-0037",
    "plateNo": "4บย2441",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-23T19:11:00+07:00",
    "exitAt": "2026-07-25T03:40:00+07:00",
    "exitTimeLimit": "2026-07-25T03:40:00+07:00",
    "amount": 590,
    "netAmount": 590,
    "totalPaid": 590,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0039", "method": "promptpay", "channel": "gate", "paidAmount": 590, "paidAt": "2026-07-25T03:40:00+07:00", "expiryAt": "2026-07-25T03:40:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-23T19:11:00+07:00",
    "updatedAt": "2026-07-25T03:40:00+07:00"
  },
  {
    "id": "t_seed_0038",
    "billNo": "PK20260724-060500-0038",
    "plateNo": "3นม9459",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-24T06:05:00+07:00",
    "exitAt": "2026-07-24T08:04:00+07:00",
    "exitTimeLimit": "2026-07-24T08:04:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0040", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-07-24T08:04:00+07:00", "expiryAt": "2026-07-24T08:04:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-24T06:05:00+07:00",
    "updatedAt": "2026-07-24T08:04:00+07:00"
  },
  {
    "id": "t_seed_0039",
    "billNo": "PK20260724-121400-0039",
    "plateNo": "2คง1987",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-24T12:14:00+07:00",
    "exitAt": "2026-07-24T14:39:00+07:00",
    "exitTimeLimit": "2026-07-24T14:39:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0041", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-07-24T12:40:00+07:00", "expiryAt": "2026-07-24T13:10:00+07:00", "source": "admin", "processedBy": "u1"},
      {"id": "pay_seed_0042", "method": "promptpay", "channel": "gate", "paidAmount": 30, "paidAt": "2026-07-24T14:39:00+07:00", "expiryAt": "2026-07-24T14:39:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-07-24T12:14:00+07:00",
    "updatedAt": "2026-07-24T14:39:00+07:00"
  },
  {
    "id": "t_seed_0040",
    "billNo": "PK20260724-064900-0040",
    "plateNo": "3ฉช9505",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-24T06:49:00+07:00",
    "exitAt": "2026-07-24T11:39:00+07:00",
    "exitTimeLimit": "2026-07-24T12:04:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0043", "method": "cash", "channel": "cashier", "paidAmount": 70, "paidAt": "2026-07-24T11:34:00+07:00", "expiryAt": "2026-07-24T12:04:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-07-24T06:49:00+07:00",
    "updatedAt": "2026-07-24T11:39:00+07:00"
  },
  {
    "id": "t_seed_0041",
    "billNo": "PK20260725-143300-0041",
    "plateNo": "5กข538",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-25T14:33:00+07:00",
    "exitAt": "2026-07-25T16:30:00+07:00",
    "exitTimeLimit": "2026-07-25T16:43:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0044", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-07-25T16:13:00+07:00", "expiryAt": "2026-07-25T16:43:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-25T14:33:00+07:00",
    "updatedAt": "2026-07-25T16:30:00+07:00"
  },
  {
    "id": "t_seed_0042",
    "billNo": "PK20260726-112900-0042",
    "plateNo": "5กข1929",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-26T11:29:00+07:00",
    "exitAt": "2026-07-26T12:46:00+07:00",
    "exitTimeLimit": "2026-07-26T12:57:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0045", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-07-26T12:27:00+07:00", "expiryAt": "2026-07-26T12:57:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-07-26T11:29:00+07:00",
    "updatedAt": "2026-07-26T12:46:00+07:00"
  },
  {
    "id": "t_seed_0043",
    "billNo": "PK20260727-191100-0043",
    "plateNo": "3คง5682",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-27T19:11:00+07:00",
    "exitAt": "2026-07-28T01:05:00+07:00",
    "exitTimeLimit": "2026-07-28T01:31:00+07:00",
    "amount": 210,
    "netAmount": 210,
    "totalPaid": 210,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0046", "method": "cash", "channel": "cashier", "paidAmount": 210, "paidAt": "2026-07-28T01:01:00+07:00", "expiryAt": "2026-07-28T01:31:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-07-27T19:11:00+07:00",
    "updatedAt": "2026-07-28T01:05:00+07:00"
  },
  {
    "id": "t_seed_0044",
    "billNo": "PK20260728-201200-0044",
    "plateNo": "1คง1417",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-28T20:12:00+07:00",
    "exitAt": "2026-07-29T01:18:00+07:00",
    "exitTimeLimit": "2026-07-29T01:28:00+07:00",
    "amount": 180,
    "netAmount": 180,
    "totalPaid": 180,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0047", "method": "promptpay", "channel": "kiosk", "paidAmount": 180, "paidAt": "2026-07-29T00:58:00+07:00", "expiryAt": "2026-07-29T01:28:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-28T20:12:00+07:00",
    "updatedAt": "2026-07-29T01:18:00+07:00"
  },
  {
    "id": "t_seed_0045",
    "billNo": "PK20260728-104700-0045",
    "plateNo": "2คง1987",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-28T10:47:00+07:00",
    "exitAt": "2026-07-28T15:25:00+07:00",
    "exitTimeLimit": "2026-07-28T15:35:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0048", "method": "cash", "channel": "cashier", "paidAmount": 70, "paidAt": "2026-07-28T15:05:00+07:00", "expiryAt": "2026-07-28T15:35:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-07-28T10:47:00+07:00",
    "updatedAt": "2026-07-28T15:25:00+07:00"
  },
  {
    "id": "t_seed_0046",
    "billNo": "PK20260729-063300-0046",
    "plateNo": "4งจ3256",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-29T06:33:00+07:00",
    "exitAt": "2026-07-29T07:07:00+07:00",
    "exitTimeLimit": "2026-07-29T07:27:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0049", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-07-29T06:57:00+07:00", "expiryAt": "2026-07-29T07:27:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-07-29T06:33:00+07:00",
    "updatedAt": "2026-07-29T07:07:00+07:00"
  },
  {
    "id": "t_seed_0047",
    "billNo": "PK20260730-072100-0047",
    "plateNo": "6ฮก2759",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-30T07:21:00+07:00",
    "exitAt": "2026-07-30T18:50:00+07:00",
    "exitTimeLimit": "2026-07-30T19:01:00+07:00",
    "amount": 140,
    "netAmount": 140,
    "totalPaid": 140,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0050", "method": "promptpay", "channel": "mobile", "paidAmount": 140, "paidAt": "2026-07-30T18:31:00+07:00", "expiryAt": "2026-07-30T19:01:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-07-30T07:21:00+07:00",
    "updatedAt": "2026-07-30T18:50:00+07:00"
  },
  {
    "id": "t_seed_0048",
    "billNo": "PK20260730-183700-0048",
    "plateNo": "7รล6618",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-30T18:37:00+07:00",
    "exitAt": "2026-07-30T20:36:00+07:00",
    "exitTimeLimit": "2026-07-30T20:59:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0051", "method": "cash", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-07-30T20:29:00+07:00", "expiryAt": "2026-07-30T20:59:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-07-30T18:37:00+07:00",
    "updatedAt": "2026-07-30T20:36:00+07:00"
  },
  {
    "id": "t_seed_0049",
    "billNo": "PK20260730-100100-0049",
    "plateNo": "1ฒท293",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-07-30T10:01:00+07:00",
    "exitAt": "2026-07-30T13:06:00+07:00",
    "exitTimeLimit": "2026-07-30T13:32:00+07:00",
    "amount": 30,
    "netAmount": 30,
    "totalPaid": 30,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0052", "method": "promptpay", "channel": "kiosk", "paidAmount": 30, "paidAt": "2026-07-30T13:02:00+07:00", "expiryAt": "2026-07-30T13:32:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-30T10:01:00+07:00",
    "updatedAt": "2026-07-30T13:06:00+07:00"
  },
  {
    "id": "t_seed_0050",
    "billNo": "PK20260731-162300-0050",
    "plateNo": "8ฉช8943",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-31T16:23:00+07:00",
    "exitAt": "2026-07-31T18:15:00+07:00",
    "exitTimeLimit": "2026-07-31T18:40:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0053", "method": "promptpay", "channel": "kiosk", "paidAmount": 40, "paidAt": "2026-07-31T18:10:00+07:00", "expiryAt": "2026-07-31T18:40:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-07-31T16:23:00+07:00",
    "updatedAt": "2026-07-31T18:15:00+07:00"
  },
  {
    "id": "t_seed_0051",
    "billNo": "PK20260731-154600-0051",
    "plateNo": "6งจ5524",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-07-31T15:46:00+07:00",
    "exitAt": "2026-07-31T16:27:00+07:00",
    "exitTimeLimit": "2026-07-31T16:50:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0054", "method": "promptpay", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-07-31T16:20:00+07:00", "expiryAt": "2026-07-31T16:50:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-07-31T15:46:00+07:00",
    "updatedAt": "2026-07-31T16:27:00+07:00"
  }
];

// Mock ข้อมูลรถเดือนสิงหาคม 2026 50 รายการ
const august2026: Prisma.TransactionCreateInput[] = [
  {
    "id": "t_seed_0052",
    "billNo": "PK20260801-123000-0052",
    "plateNo": "6ฬอ7854",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-01T12:30:00+07:00",
    "exitAt": "2026-08-01T13:28:00+07:00",
    "exitTimeLimit": "2026-08-01T13:52:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0055", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-08-01T13:22:00+07:00", "expiryAt": "2026-08-01T13:52:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-08-01T12:30:00+07:00",
    "updatedAt": "2026-08-01T13:28:00+07:00"
  },
  {
    "id": "t_seed_0053",
    "billNo": "PK20260803-165700-0053",
    "plateNo": "4บย2441",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-03T16:57:00+07:00",
    "exitAt": "2026-08-03T18:34:00+07:00",
    "exitTimeLimit": "2026-08-03T18:34:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0056", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-08-03T17:15:00+07:00", "expiryAt": "2026-08-03T17:45:00+07:00", "source": "mobile", "processedBy": "mobile_user"},
      {"id": "pay_seed_0057", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-08-03T18:34:00+07:00", "expiryAt": "2026-08-03T18:34:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-03T16:57:00+07:00",
    "updatedAt": "2026-08-03T18:34:00+07:00"
  },
  {
    "id": "t_seed_0054",
    "billNo": "PK20260803-115700-0054",
    "plateNo": "7สห1511",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-03T11:57:00+07:00",
    "exitAt": "2026-08-03T13:42:00+07:00",
    "exitTimeLimit": "2026-08-03T14:04:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0058", "method": "promptpay", "channel": "kiosk", "paidAmount": 40, "paidAt": "2026-08-03T13:34:00+07:00", "expiryAt": "2026-08-03T14:04:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-08-03T11:57:00+07:00",
    "updatedAt": "2026-08-03T13:42:00+07:00"
  },
  {
    "id": "t_seed_0055",
    "billNo": "PK20260804-114900-0055",
    "plateNo": "4บย2441",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-04T11:49:00+07:00",
    "exitAt": "2026-08-04T16:05:00+07:00",
    "exitTimeLimit": "2026-08-04T16:05:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0059", "method": "promptpay", "channel": "gate", "paidAmount": 70, "paidAt": "2026-08-04T16:05:00+07:00", "expiryAt": "2026-08-04T16:05:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-04T11:49:00+07:00",
    "updatedAt": "2026-08-04T16:05:00+07:00"
  },
  {
    "id": "t_seed_0056",
    "billNo": "PK20260805-173900-0056",
    "plateNo": "4ฒท8022",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-05T17:39:00+07:00",
    "exitAt": "2026-08-05T20:01:00+07:00",
    "exitTimeLimit": "2026-08-05T20:28:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0060", "method": "promptpay", "channel": "kiosk", "paidAmount": 50, "paidAt": "2026-08-05T19:58:00+07:00", "expiryAt": "2026-08-05T20:28:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-08-05T17:39:00+07:00",
    "updatedAt": "2026-08-05T20:01:00+07:00"
  },
  {
    "id": "t_seed_0057",
    "billNo": "PK20260805-185800-0057",
    "plateNo": "1คง1417",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-05T18:58:00+07:00",
    "exitAt": "2026-08-05T20:04:00+07:00",
    "exitTimeLimit": "2026-08-05T20:04:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0061", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-08-05T20:04:00+07:00", "expiryAt": "2026-08-05T20:04:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-05T18:58:00+07:00",
    "updatedAt": "2026-08-05T20:04:00+07:00"
  },
  {
    "id": "t_seed_0058",
    "billNo": "PK20260806-132400-0058",
    "plateNo": "3ฉช9505",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-06T13:24:00+07:00",
    "exitAt": "2026-08-06T15:48:00+07:00",
    "exitTimeLimit": "2026-08-06T16:08:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0062", "method": "promptpay", "channel": "mobile", "paidAmount": 50, "paidAt": "2026-08-06T15:38:00+07:00", "expiryAt": "2026-08-06T16:08:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-06T13:24:00+07:00",
    "updatedAt": "2026-08-06T15:48:00+07:00"
  },
  {
    "id": "t_seed_0059",
    "billNo": "PK20260807-064300-0059",
    "plateNo": "6ฬอ7854",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-07T06:43:00+07:00",
    "exitAt": "2026-08-07T09:20:00+07:00",
    "exitTimeLimit": "2026-08-07T09:20:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0063", "method": "promptpay", "channel": "gate", "paidAmount": 50, "paidAt": "2026-08-07T09:20:00+07:00", "expiryAt": "2026-08-07T09:20:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-07T06:43:00+07:00",
    "updatedAt": "2026-08-07T09:20:00+07:00"
  },
  {
    "id": "t_seed_0060",
    "billNo": "PK20260807-115400-0060",
    "plateNo": "6ฬอ7854",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-07T11:54:00+07:00",
    "exitAt": "2026-08-07T19:41:00+07:00",
    "exitTimeLimit": "2026-08-07T19:41:00+07:00",
    "amount": 100,
    "netAmount": 100,
    "totalPaid": 100,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0064", "method": "promptpay", "channel": "gate", "paidAmount": 100, "paidAt": "2026-08-07T19:41:00+07:00", "expiryAt": "2026-08-07T19:41:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-07T11:54:00+07:00",
    "updatedAt": "2026-08-07T19:41:00+07:00"
  },
  {
    "id": "t_seed_0061",
    "billNo": "PK20260807-184800-0061",
    "plateNo": "8ฬอ293",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-07T18:48:00+07:00",
    "exitAt": "2026-08-07T20:42:00+07:00",
    "exitTimeLimit": "2026-08-07T20:56:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0065", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-08-07T20:26:00+07:00", "expiryAt": "2026-08-07T20:56:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-08-07T18:48:00+07:00",
    "updatedAt": "2026-08-07T20:42:00+07:00"
  },
  {
    "id": "t_seed_0062",
    "billNo": "PK20260808-161200-0062",
    "plateNo": "4วศ7277",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-08T16:12:00+07:00",
    "exitAt": "2026-08-08T18:05:00+07:00",
    "exitTimeLimit": "2026-08-08T18:32:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0066", "method": "promptpay", "channel": "mobile", "paidAmount": 40, "paidAt": "2026-08-08T18:02:00+07:00", "expiryAt": "2026-08-08T18:32:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-08T16:12:00+07:00",
    "updatedAt": "2026-08-08T18:05:00+07:00"
  },
  {
    "id": "t_seed_0063",
    "billNo": "PK20260810-144800-0063",
    "plateNo": "4บย2441",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-10T14:48:00+07:00",
    "exitAt": "2026-08-10T18:11:00+07:00",
    "exitTimeLimit": "2026-08-10T18:38:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0067", "method": "promptpay", "channel": "mobile", "paidAmount": 60, "paidAt": "2026-08-10T18:08:00+07:00", "expiryAt": "2026-08-10T18:38:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-10T14:48:00+07:00",
    "updatedAt": "2026-08-10T18:11:00+07:00"
  },
  {
    "id": "t_seed_0064",
    "billNo": "PK20260810-192300-0064",
    "plateNo": "2ฮก3887",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-10T19:23:00+07:00",
    "exitAt": "2026-08-11T03:58:00+07:00",
    "exitTimeLimit": "2026-08-11T04:14:00+07:00",
    "amount": 230,
    "netAmount": 230,
    "totalPaid": 230,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0068", "method": "promptpay", "channel": "cashier", "paidAmount": 230, "paidAt": "2026-08-11T03:44:00+07:00", "expiryAt": "2026-08-11T04:14:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-08-10T19:23:00+07:00",
    "updatedAt": "2026-08-11T03:58:00+07:00"
  },
  {
    "id": "t_seed_0065",
    "billNo": "PK20260810-112100-0065",
    "plateNo": "9รล1490",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-10T11:21:00+07:00",
    "exitAt": "2026-08-10T14:48:00+07:00",
    "exitTimeLimit": "2026-08-10T15:13:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0069", "method": "promptpay", "channel": "mobile", "paidAmount": 60, "paidAt": "2026-08-10T14:43:00+07:00", "expiryAt": "2026-08-10T15:13:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-10T11:21:00+07:00",
    "updatedAt": "2026-08-10T14:48:00+07:00"
  },
  {
    "id": "t_seed_0066",
    "billNo": "PK20260811-122500-0066",
    "plateNo": "1กข190",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-11T12:25:00+07:00",
    "exitAt": "2026-08-11T13:56:00+07:00",
    "exitTimeLimit": "2026-08-11T14:16:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0070", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-08-11T13:46:00+07:00", "expiryAt": "2026-08-11T14:16:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-08-11T12:25:00+07:00",
    "updatedAt": "2026-08-11T13:56:00+07:00"
  },
  {
    "id": "t_seed_0067",
    "billNo": "PK20260811-061400-0067",
    "plateNo": "1วศ4693",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-11T06:14:00+07:00",
    "exitAt": "2026-08-11T11:05:00+07:00",
    "exitTimeLimit": "2026-08-11T11:05:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0071", "method": "promptpay", "channel": "gate", "paidAmount": 70, "paidAt": "2026-08-11T11:05:00+07:00", "expiryAt": "2026-08-11T11:05:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-11T06:14:00+07:00",
    "updatedAt": "2026-08-11T11:05:00+07:00"
  },
  {
    "id": "t_seed_0068",
    "billNo": "PK20260811-095200-0068",
    "plateNo": "4บย2441",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-11T09:52:00+07:00",
    "exitAt": "2026-08-11T13:56:00+07:00",
    "exitTimeLimit": "2026-08-11T13:56:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0072", "method": "promptpay", "channel": "mobile", "paidAmount": 40, "paidAt": "2026-08-11T11:33:00+07:00", "expiryAt": "2026-08-11T12:03:00+07:00", "source": "mobile", "processedBy": "mobile_user"},
      {"id": "pay_seed_0073", "method": "promptpay", "channel": "gate", "paidAmount": 30, "paidAt": "2026-08-11T13:56:00+07:00", "expiryAt": "2026-08-11T13:56:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-11T09:52:00+07:00",
    "updatedAt": "2026-08-11T13:56:00+07:00"
  },
  {
    "id": "t_seed_0069",
    "billNo": "PK20260812-091700-0069",
    "plateNo": "3งจ1487",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-12T09:17:00+07:00",
    "exitAt": "2026-08-12T12:38:00+07:00",
    "exitTimeLimit": "2026-08-12T12:38:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0074", "method": "promptpay", "channel": "gate", "paidAmount": 60, "paidAt": "2026-08-12T12:38:00+07:00", "expiryAt": "2026-08-12T12:38:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-12T09:17:00+07:00",
    "updatedAt": "2026-08-12T12:38:00+07:00"
  },
  {
    "id": "t_seed_0070",
    "billNo": "PK20260812-082000-0070",
    "plateNo": "4ฒท458",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-12T08:20:00+07:00",
    "exitAt": "2026-08-12T12:33:00+07:00",
    "exitTimeLimit": "2026-08-12T12:49:00+07:00",
    "amount": 30,
    "netAmount": 30,
    "totalPaid": 30,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0075", "method": "promptpay", "channel": "mobile", "paidAmount": 30, "paidAt": "2026-08-12T12:19:00+07:00", "expiryAt": "2026-08-12T12:49:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-12T08:20:00+07:00",
    "updatedAt": "2026-08-12T12:33:00+07:00"
  },
  {
    "id": "t_seed_0071",
    "billNo": "PK20260813-182700-0071",
    "plateNo": "6งจ5524",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-13T18:27:00+07:00",
    "status": "cancelled",
    "payments": [],
    "createdAt": "2026-08-13T18:27:00+07:00",
    "updatedAt": "2026-08-13T18:55:00+07:00"
  },
  {
    "id": "t_seed_0072",
    "billNo": "PK20260813-111700-0072",
    "plateNo": "4วศ7277",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-13T11:17:00+07:00",
    "exitAt": "2026-08-13T23:48:00+07:00",
    "exitTimeLimit": "2026-08-13T23:48:00+07:00",
    "amount": 150,
    "netAmount": 150,
    "totalPaid": 150,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0076", "method": "promptpay", "channel": "kiosk", "paidAmount": 130, "paidAt": "2026-08-13T21:42:00+07:00", "expiryAt": "2026-08-13T22:12:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"},
      {"id": "pay_seed_0077", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-08-13T23:48:00+07:00", "expiryAt": "2026-08-13T23:48:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-13T11:17:00+07:00",
    "updatedAt": "2026-08-13T23:48:00+07:00"
  },
  {
    "id": "t_seed_0073",
    "billNo": "PK20260813-154200-0073",
    "plateNo": "5รล4625",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-13T15:42:00+07:00",
    "exitAt": "2026-08-13T16:13:00+07:00",
    "exitTimeLimit": "2026-08-13T16:24:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0078", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-08-13T15:54:00+07:00", "expiryAt": "2026-08-13T16:24:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-13T15:42:00+07:00",
    "updatedAt": "2026-08-13T16:13:00+07:00"
  },
  {
    "id": "t_seed_0074",
    "billNo": "PK20260814-075600-0074",
    "plateNo": "5กข9709",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-14T07:56:00+07:00",
    "exitAt": "2026-08-14T09:45:00+07:00",
    "exitTimeLimit": "2026-08-14T09:45:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0079", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-08-14T09:45:00+07:00", "expiryAt": "2026-08-14T09:45:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-14T07:56:00+07:00",
    "updatedAt": "2026-08-14T09:45:00+07:00"
  },
  {
    "id": "t_seed_0075",
    "billNo": "PK20260816-104200-0075",
    "plateNo": "9รล9853",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-16T10:42:00+07:00",
    "exitAt": "2026-08-16T12:01:00+07:00",
    "exitTimeLimit": "2026-08-16T12:17:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0080", "method": "promptpay", "channel": "mobile", "paidAmount": 40, "paidAt": "2026-08-16T11:47:00+07:00", "expiryAt": "2026-08-16T12:17:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-16T10:42:00+07:00",
    "updatedAt": "2026-08-16T12:01:00+07:00"
  },
  {
    "id": "t_seed_0076",
    "billNo": "PK20260817-084100-0076",
    "plateNo": "4งจ3256",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-17T08:41:00+07:00",
    "exitAt": "2026-08-17T09:23:00+07:00",
    "exitTimeLimit": "2026-08-17T09:46:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0081", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-08-17T09:16:00+07:00", "expiryAt": "2026-08-17T09:46:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-08-17T08:41:00+07:00",
    "updatedAt": "2026-08-17T09:23:00+07:00"
  },
  {
    "id": "t_seed_0077",
    "billNo": "PK20260817-165900-0077",
    "plateNo": "2งจ9817",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-17T16:59:00+07:00",
    "exitAt": "2026-08-18T04:56:00+07:00",
    "exitTimeLimit": "2026-08-18T05:10:00+07:00",
    "amount": 270,
    "netAmount": 270,
    "totalPaid": 270,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0082", "method": "promptpay", "channel": "mobile", "paidAmount": 270, "paidAt": "2026-08-18T04:40:00+07:00", "expiryAt": "2026-08-18T05:10:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-17T16:59:00+07:00",
    "updatedAt": "2026-08-18T04:56:00+07:00"
  },
  {
    "id": "t_seed_0078",
    "billNo": "PK20260817-133800-0078",
    "plateNo": "9สห2531",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-17T13:38:00+07:00",
    "exitAt": "2026-08-17T15:39:00+07:00",
    "exitTimeLimit": "2026-08-17T15:54:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0083", "method": "cash", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-08-17T15:24:00+07:00", "expiryAt": "2026-08-17T15:54:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-08-17T13:38:00+07:00",
    "updatedAt": "2026-08-17T15:39:00+07:00"
  },
  {
    "id": "t_seed_0079",
    "billNo": "PK20260818-063500-0079",
    "plateNo": "1กข190",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-18T06:35:00+07:00",
    "exitAt": "2026-08-18T07:36:00+07:00",
    "exitTimeLimit": "2026-08-18T07:56:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0084", "method": "promptpay", "channel": "kiosk", "paidAmount": 10, "paidAt": "2026-08-18T07:26:00+07:00", "expiryAt": "2026-08-18T07:56:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-08-18T06:35:00+07:00",
    "updatedAt": "2026-08-18T07:36:00+07:00"
  },
  {
    "id": "t_seed_0080",
    "billNo": "PK20260819-203400-0080",
    "plateNo": "3วศ1240",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-19T20:34:00+07:00",
    "exitAt": "2026-08-19T21:18:00+07:00",
    "exitTimeLimit": "2026-08-19T21:30:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0085", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-08-19T21:00:00+07:00", "expiryAt": "2026-08-19T21:30:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-19T20:34:00+07:00",
    "updatedAt": "2026-08-19T21:18:00+07:00"
  },
  {
    "id": "t_seed_0081",
    "billNo": "PK20260820-123800-0081",
    "plateNo": "5กข1929",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-20T12:38:00+07:00",
    "exitAt": "2026-08-20T18:13:00+07:00",
    "exitTimeLimit": "2026-08-20T18:31:00+07:00",
    "amount": 80,
    "netAmount": 80,
    "totalPaid": 80,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0086", "method": "promptpay", "channel": "mobile", "paidAmount": 80, "paidAt": "2026-08-20T18:01:00+07:00", "expiryAt": "2026-08-20T18:31:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-20T12:38:00+07:00",
    "updatedAt": "2026-08-20T18:13:00+07:00"
  },
  {
    "id": "t_seed_0082",
    "billNo": "PK20260820-094100-0082",
    "plateNo": "9รล9853",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-20T09:41:00+07:00",
    "exitAt": "2026-08-20T10:18:00+07:00",
    "exitTimeLimit": "2026-08-20T10:41:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0087", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-08-20T10:11:00+07:00", "expiryAt": "2026-08-20T10:41:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-20T09:41:00+07:00",
    "updatedAt": "2026-08-20T10:18:00+07:00"
  },
  {
    "id": "t_seed_0083",
    "billNo": "PK20260821-192800-0083",
    "plateNo": "1งจ2671",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-21T19:28:00+07:00",
    "exitAt": "2026-08-21T23:03:00+07:00",
    "exitTimeLimit": "2026-08-21T23:29:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0088", "method": "cash", "channel": "cashier", "paidAmount": 60, "paidAt": "2026-08-21T22:59:00+07:00", "expiryAt": "2026-08-21T23:29:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-08-21T19:28:00+07:00",
    "updatedAt": "2026-08-21T23:03:00+07:00"
  },
  {
    "id": "t_seed_0084",
    "billNo": "PK20260821-102900-0084",
    "plateNo": "1งจ2671",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-21T10:29:00+07:00",
    "exitAt": "2026-08-21T14:07:00+07:00",
    "exitTimeLimit": "2026-08-21T14:33:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0089", "method": "promptpay", "channel": "kiosk", "paidAmount": 60, "paidAt": "2026-08-21T14:03:00+07:00", "expiryAt": "2026-08-21T14:33:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-08-21T10:29:00+07:00",
    "updatedAt": "2026-08-21T14:07:00+07:00"
  },
  {
    "id": "t_seed_0085",
    "billNo": "PK20260821-141500-0085",
    "plateNo": "1คง1057",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-21T14:15:00+07:00",
    "exitAt": "2026-08-21T15:45:00+07:00",
    "exitTimeLimit": "2026-08-21T15:59:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0090", "method": "promptpay", "channel": "mobile", "paidAmount": 40, "paidAt": "2026-08-21T15:29:00+07:00", "expiryAt": "2026-08-21T15:59:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-21T14:15:00+07:00",
    "updatedAt": "2026-08-21T15:45:00+07:00"
  },
  {
    "id": "t_seed_0086",
    "billNo": "PK20260822-083800-0086",
    "plateNo": "3บย9229",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-22T08:38:00+07:00",
    "exitAt": "2026-08-22T09:41:00+07:00",
    "exitTimeLimit": "2026-08-22T09:41:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0091", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-08-22T09:41:00+07:00", "expiryAt": "2026-08-22T09:41:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-22T08:38:00+07:00",
    "updatedAt": "2026-08-22T09:41:00+07:00"
  },
  {
    "id": "t_seed_0087",
    "billNo": "PK20260822-151300-0087",
    "plateNo": "1วศ4693",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-22T15:13:00+07:00",
    "exitAt": "2026-08-23T02:59:00+07:00",
    "exitTimeLimit": "2026-08-23T03:20:00+07:00",
    "amount": 260,
    "netAmount": 260,
    "totalPaid": 260,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0092", "method": "promptpay", "channel": "mobile", "paidAmount": 260, "paidAt": "2026-08-23T02:50:00+07:00", "expiryAt": "2026-08-23T03:20:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-22T15:13:00+07:00",
    "updatedAt": "2026-08-23T02:59:00+07:00"
  },
  {
    "id": "t_seed_0088",
    "billNo": "PK20260824-141900-0088",
    "plateNo": "5รล4625",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-24T14:19:00+07:00",
    "exitAt": "2026-08-24T18:23:00+07:00",
    "exitTimeLimit": "2026-08-24T18:45:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0093", "method": "promptpay", "channel": "mobile", "paidAmount": 60, "paidAt": "2026-08-24T18:15:00+07:00", "expiryAt": "2026-08-24T18:45:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-24T14:19:00+07:00",
    "updatedAt": "2026-08-24T18:23:00+07:00"
  },
  {
    "id": "t_seed_0089",
    "billNo": "PK20260824-145800-0089",
    "plateNo": "7กข9877",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-24T14:58:00+07:00",
    "exitAt": "2026-08-25T01:33:00+07:00",
    "exitTimeLimit": "2026-08-25T01:52:00+07:00",
    "amount": 260,
    "netAmount": 260,
    "totalPaid": 260,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0094", "method": "promptpay", "channel": "cashier", "paidAmount": 260, "paidAt": "2026-08-25T01:22:00+07:00", "expiryAt": "2026-08-25T01:52:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-08-24T14:58:00+07:00",
    "updatedAt": "2026-08-25T01:33:00+07:00"
  },
  {
    "id": "t_seed_0090",
    "billNo": "PK20260825-165200-0090",
    "plateNo": "9ฉช915",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-25T16:52:00+07:00",
    "exitAt": "2026-08-25T17:22:00+07:00",
    "exitTimeLimit": "2026-08-25T17:33:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0095", "method": "cash", "channel": "cashier", "paidAmount": 10, "paidAt": "2026-08-25T17:03:00+07:00", "expiryAt": "2026-08-25T17:33:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-08-25T16:52:00+07:00",
    "updatedAt": "2026-08-25T17:22:00+07:00"
  },
  {
    "id": "t_seed_0091",
    "billNo": "PK20260825-070300-0091",
    "plateNo": "6รล3564",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-25T07:03:00+07:00",
    "exitAt": "2026-08-25T08:53:00+07:00",
    "exitTimeLimit": "2026-08-25T09:07:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0096", "method": "promptpay", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-08-25T08:37:00+07:00", "expiryAt": "2026-08-25T09:07:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-08-25T07:03:00+07:00",
    "updatedAt": "2026-08-25T08:53:00+07:00"
  },
  {
    "id": "t_seed_0092",
    "billNo": "PK20260826-161700-0092",
    "plateNo": "1ฒท293",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-26T16:17:00+07:00",
    "exitAt": "2026-08-26T16:45:00+07:00",
    "exitTimeLimit": "2026-08-26T17:00:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0097", "method": "promptpay", "channel": "cashier", "paidAmount": 10, "paidAt": "2026-08-26T16:30:00+07:00", "expiryAt": "2026-08-26T17:00:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-08-26T16:17:00+07:00",
    "updatedAt": "2026-08-26T16:45:00+07:00"
  },
  {
    "id": "t_seed_0093",
    "billNo": "PK20260827-130100-0093",
    "plateNo": "9ขก8546",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-27T13:01:00+07:00",
    "exitAt": "2026-08-27T13:40:00+07:00",
    "exitTimeLimit": "2026-08-27T14:00:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0098", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-08-27T13:30:00+07:00", "expiryAt": "2026-08-27T14:00:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-27T13:01:00+07:00",
    "updatedAt": "2026-08-27T13:40:00+07:00"
  },
  {
    "id": "t_seed_0094",
    "billNo": "PK20260827-154300-0094",
    "plateNo": "4วศ7277",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-27T15:43:00+07:00",
    "exitAt": "2026-08-27T18:47:00+07:00",
    "exitTimeLimit": "2026-08-27T18:47:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0099", "method": "cash", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-08-27T17:04:00+07:00", "expiryAt": "2026-08-27T17:34:00+07:00", "source": "admin", "processedBy": "u4"},
      {"id": "pay_seed_0100", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-08-27T18:47:00+07:00", "expiryAt": "2026-08-27T18:47:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-08-27T15:43:00+07:00",
    "updatedAt": "2026-08-27T18:47:00+07:00"
  },
  {
    "id": "t_seed_0095",
    "billNo": "PK20260827-191700-0095",
    "plateNo": "1วศ4693",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-27T19:17:00+07:00",
    "exitAt": "2026-08-27T20:09:00+07:00",
    "exitTimeLimit": "2026-08-27T20:26:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0101", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-08-27T19:56:00+07:00", "expiryAt": "2026-08-27T20:26:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-27T19:17:00+07:00",
    "updatedAt": "2026-08-27T20:09:00+07:00"
  },
  {
    "id": "t_seed_0096",
    "billNo": "PK20260828-065600-0096",
    "plateNo": "3งจ573",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-28T06:56:00+07:00",
    "exitAt": "2026-08-28T07:34:00+07:00",
    "exitTimeLimit": "2026-08-28T07:56:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0102", "method": "cash", "channel": "cashier", "paidAmount": 10, "paidAt": "2026-08-28T07:26:00+07:00", "expiryAt": "2026-08-28T07:56:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-08-28T06:56:00+07:00",
    "updatedAt": "2026-08-28T07:34:00+07:00"
  },
  {
    "id": "t_seed_0097",
    "billNo": "PK20260828-075900-0097",
    "plateNo": "8ฬอ293",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-08-28T07:59:00+07:00",
    "exitAt": "2026-08-28T08:36:00+07:00",
    "exitTimeLimit": "2026-08-28T08:59:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0103", "method": "cash", "channel": "cashier", "paidAmount": 10, "paidAt": "2026-08-28T08:29:00+07:00", "expiryAt": "2026-08-28T08:59:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-08-28T07:59:00+07:00",
    "updatedAt": "2026-08-28T08:36:00+07:00"
  },
  {
    "id": "t_seed_0098",
    "billNo": "PK20260828-154200-0098",
    "plateNo": "3งจ1487",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-28T15:42:00+07:00",
    "exitAt": "2026-08-28T19:24:00+07:00",
    "exitTimeLimit": "2026-08-28T19:34:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0104", "method": "promptpay", "channel": "mobile", "paidAmount": 60, "paidAt": "2026-08-28T19:04:00+07:00", "expiryAt": "2026-08-28T19:34:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-28T15:42:00+07:00",
    "updatedAt": "2026-08-28T19:24:00+07:00"
  },
  {
    "id": "t_seed_0099",
    "billNo": "PK20260830-133000-0099",
    "plateNo": "6ฬอ7854",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-30T13:30:00+07:00",
    "exitAt": "2026-08-30T16:20:00+07:00",
    "exitTimeLimit": "2026-08-30T16:43:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0105", "method": "promptpay", "channel": "mobile", "paidAmount": 50, "paidAt": "2026-08-30T16:13:00+07:00", "expiryAt": "2026-08-30T16:43:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-08-30T13:30:00+07:00",
    "updatedAt": "2026-08-30T16:20:00+07:00"
  },
  {
    "id": "t_seed_0100",
    "billNo": "PK20260831-152200-0100",
    "plateNo": "1สห1707",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-31T15:22:00+07:00",
    "exitAt": "2026-08-31T16:23:00+07:00",
    "exitTimeLimit": "2026-08-31T16:44:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0106", "method": "promptpay", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-08-31T16:14:00+07:00", "expiryAt": "2026-08-31T16:44:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-08-31T15:22:00+07:00",
    "updatedAt": "2026-08-31T16:23:00+07:00"
  },
  {
    "id": "t_seed_0101",
    "billNo": "PK20260831-090900-0101",
    "plateNo": "2งจ9817",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-08-31T09:09:00+07:00",
    "exitAt": "2026-08-31T13:13:00+07:00",
    "exitTimeLimit": "2026-08-31T13:32:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0107", "method": "cash", "channel": "cashier", "paidAmount": 60, "paidAt": "2026-08-31T13:02:00+07:00", "expiryAt": "2026-08-31T13:32:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-08-31T09:09:00+07:00",
    "updatedAt": "2026-08-31T13:13:00+07:00"
  }
];

// Mock ข้อมูลรถเดือนกันยายน 2026 54 รายการ
const september2026: Prisma.TransactionCreateInput[] = [
  {
    "id": "t_seed_0102",
    "billNo": "PK20260901-123000-0102",
    "plateNo": "1สห1707",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-01T12:30:00+07:00",
    "exitAt": "2026-09-01T16:57:00+07:00",
    "exitTimeLimit": "2026-09-01T17:24:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0108", "method": "cash", "channel": "cashier", "paidAmount": 70, "paidAt": "2026-09-01T16:54:00+07:00", "expiryAt": "2026-09-01T17:24:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-01T12:30:00+07:00",
    "updatedAt": "2026-09-01T16:57:00+07:00"
  },
  {
    "id": "t_seed_0103",
    "billNo": "PK20260901-192000-0103",
    "plateNo": "4กค6483",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-01T19:20:00+07:00",
    "exitAt": "2026-09-01T20:34:00+07:00",
    "exitTimeLimit": "2026-09-01T20:34:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0109", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-09-01T20:34:00+07:00", "expiryAt": "2026-09-01T20:34:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-01T19:20:00+07:00",
    "updatedAt": "2026-09-01T20:34:00+07:00"
  },
  {
    "id": "t_seed_0104",
    "billNo": "PK20260901-151500-0104",
    "plateNo": "9นม2950",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-01T15:15:00+07:00",
    "exitAt": "2026-09-01T19:04:00+07:00",
    "exitTimeLimit": "2026-09-01T19:28:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0110", "method": "cash", "channel": "cashier", "paidAmount": 60, "paidAt": "2026-09-01T18:58:00+07:00", "expiryAt": "2026-09-01T19:28:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-01T15:15:00+07:00",
    "updatedAt": "2026-09-01T19:04:00+07:00"
  },
  {
    "id": "t_seed_0105",
    "billNo": "PK20260902-060900-0105",
    "plateNo": "2ฮก3887",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-02T06:09:00+07:00",
    "exitAt": "2026-09-02T07:42:00+07:00",
    "exitTimeLimit": "2026-09-02T08:06:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0111", "method": "cash", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-09-02T07:36:00+07:00", "expiryAt": "2026-09-02T08:06:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-02T06:09:00+07:00",
    "updatedAt": "2026-09-02T07:42:00+07:00"
  },
  {
    "id": "t_seed_0106",
    "billNo": "PK20260902-201200-0106",
    "plateNo": "3ฉช9505",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-02T20:12:00+07:00",
    "exitAt": "2026-09-02T22:57:00+07:00",
    "exitTimeLimit": "2026-09-02T23:09:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0112", "method": "promptpay", "channel": "cashier", "paidAmount": 50, "paidAt": "2026-09-02T22:39:00+07:00", "expiryAt": "2026-09-02T23:09:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-09-02T20:12:00+07:00",
    "updatedAt": "2026-09-02T22:57:00+07:00"
  },
  {
    "id": "t_seed_0107",
    "billNo": "PK20260902-171500-0107",
    "plateNo": "3วศ1240",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-02T17:15:00+07:00",
    "exitAt": "2026-09-02T22:55:00+07:00",
    "exitTimeLimit": "2026-09-02T23:20:00+07:00",
    "amount": 80,
    "netAmount": 80,
    "totalPaid": 80,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0113", "method": "promptpay", "channel": "cashier", "paidAmount": 80, "paidAt": "2026-09-02T22:50:00+07:00", "expiryAt": "2026-09-02T23:20:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-02T17:15:00+07:00",
    "updatedAt": "2026-09-02T22:55:00+07:00"
  },
  {
    "id": "t_seed_0108",
    "billNo": "PK20260903-081800-0108",
    "plateNo": "7สห8102",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-03T08:18:00+07:00",
    "exitAt": "2026-09-04T18:12:00+07:00",
    "exitTimeLimit": "2026-09-04T18:25:00+07:00",
    "amount": 480,
    "netAmount": 480,
    "totalPaid": 480,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0114", "method": "cash", "channel": "cashier", "paidAmount": 480, "paidAt": "2026-09-04T17:55:00+07:00", "expiryAt": "2026-09-04T18:25:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-09-03T08:18:00+07:00",
    "updatedAt": "2026-09-04T18:12:00+07:00"
  },
  {
    "id": "t_seed_0109",
    "billNo": "PK20260904-070300-0109",
    "plateNo": "7กข9877",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-04T07:03:00+07:00",
    "exitAt": "2026-09-04T15:25:00+07:00",
    "exitTimeLimit": "2026-09-04T15:40:00+07:00",
    "amount": 110,
    "netAmount": 110,
    "totalPaid": 110,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0115", "method": "promptpay", "channel": "kiosk", "paidAmount": 110, "paidAt": "2026-09-04T15:10:00+07:00", "expiryAt": "2026-09-04T15:40:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-04T07:03:00+07:00",
    "updatedAt": "2026-09-04T15:25:00+07:00"
  },
  {
    "id": "t_seed_0110",
    "billNo": "PK20260906-174300-0110",
    "plateNo": "7ขก7151",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-06T17:43:00+07:00",
    "exitAt": "2026-09-06T18:16:00+07:00",
    "exitTimeLimit": "2026-09-06T18:40:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0116", "method": "promptpay", "channel": "kiosk", "paidAmount": 20, "paidAt": "2026-09-06T18:10:00+07:00", "expiryAt": "2026-09-06T18:40:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-06T17:43:00+07:00",
    "updatedAt": "2026-09-06T18:16:00+07:00"
  },
  {
    "id": "t_seed_0111",
    "billNo": "PK20260907-170900-0111",
    "plateNo": "3วศ1240",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-07T17:09:00+07:00",
    "exitAt": "2026-09-07T19:17:00+07:00",
    "exitTimeLimit": "2026-09-07T19:32:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0117", "method": "cash", "channel": "cashier", "paidAmount": 40, "paidAt": "2026-09-07T19:02:00+07:00", "expiryAt": "2026-09-07T19:32:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-07T17:09:00+07:00",
    "updatedAt": "2026-09-07T19:17:00+07:00"
  },
  {
    "id": "t_seed_0112",
    "billNo": "PK20260907-182300-0112",
    "plateNo": "7กค8254",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-07T18:23:00+07:00",
    "exitAt": "2026-09-07T20:53:00+07:00",
    "exitTimeLimit": "2026-09-07T21:18:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0118", "method": "promptpay", "channel": "cashier", "paidAmount": 50, "paidAt": "2026-09-07T20:48:00+07:00", "expiryAt": "2026-09-07T21:18:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-07T18:23:00+07:00",
    "updatedAt": "2026-09-07T20:53:00+07:00"
  },
  {
    "id": "t_seed_0113",
    "billNo": "PK20260908-145400-0113",
    "plateNo": "7กข9877",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-08T14:54:00+07:00",
    "exitAt": "2026-09-08T15:47:00+07:00",
    "exitTimeLimit": "2026-09-08T16:13:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0119", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-09-08T15:43:00+07:00", "expiryAt": "2026-09-08T16:13:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-08T14:54:00+07:00",
    "updatedAt": "2026-09-08T15:47:00+07:00"
  },
  {
    "id": "t_seed_0114",
    "billNo": "PK20260908-074700-0114",
    "plateNo": "9นม2950",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-08T07:47:00+07:00",
    "exitAt": "2026-09-08T08:44:00+07:00",
    "exitTimeLimit": "2026-09-08T08:44:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0120", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-09-08T08:44:00+07:00", "expiryAt": "2026-09-08T08:44:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-08T07:47:00+07:00",
    "updatedAt": "2026-09-08T08:44:00+07:00"
  },
  {
    "id": "t_seed_0115",
    "billNo": "PK20260909-130800-0115",
    "plateNo": "8ฬอ293",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-09-09T13:08:00+07:00",
    "exitAt": "2026-09-09T17:55:00+07:00",
    "exitTimeLimit": "2026-09-09T17:55:00+07:00",
    "amount": 35,
    "netAmount": 35,
    "totalPaid": 35,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0121", "method": "promptpay", "channel": "gate", "paidAmount": 35, "paidAt": "2026-09-09T17:55:00+07:00", "expiryAt": "2026-09-09T17:55:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-09T13:08:00+07:00",
    "updatedAt": "2026-09-09T17:55:00+07:00"
  },
  {
    "id": "t_seed_0116",
    "billNo": "PK20260910-190200-0116",
    "plateNo": "8ฉช8943",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-10T19:02:00+07:00",
    "exitAt": "2026-09-12T18:51:00+07:00",
    "exitTimeLimit": "2026-09-12T19:06:00+07:00",
    "amount": 740,
    "netAmount": 740,
    "totalPaid": 740,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0122", "method": "promptpay", "channel": "cashier", "paidAmount": 740, "paidAt": "2026-09-12T18:36:00+07:00", "expiryAt": "2026-09-12T19:06:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-10T19:02:00+07:00",
    "updatedAt": "2026-09-12T18:51:00+07:00"
  },
  {
    "id": "t_seed_0117",
    "billNo": "PK20260910-200100-0117",
    "plateNo": "9รล1490",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-10T20:01:00+07:00",
    "exitAt": "2026-09-10T21:03:00+07:00",
    "exitTimeLimit": "2026-09-10T21:03:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0123", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-09-10T21:03:00+07:00", "expiryAt": "2026-09-10T21:03:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-10T20:01:00+07:00",
    "updatedAt": "2026-09-10T21:03:00+07:00"
  },
  {
    "id": "t_seed_0118",
    "billNo": "PK20260910-164200-0118",
    "plateNo": "7รล6618",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-10T16:42:00+07:00",
    "exitAt": "2026-09-10T18:30:00+07:00",
    "exitTimeLimit": "2026-09-10T18:55:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0124", "method": "promptpay", "channel": "mobile", "paidAmount": 40, "paidAt": "2026-09-10T18:25:00+07:00", "expiryAt": "2026-09-10T18:55:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-09-10T16:42:00+07:00",
    "updatedAt": "2026-09-10T18:30:00+07:00"
  },
  {
    "id": "t_seed_0119",
    "billNo": "PK20260911-170200-0119",
    "plateNo": "2งจ9817",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-11T17:02:00+07:00",
    "exitAt": "2026-09-11T17:42:00+07:00",
    "exitTimeLimit": "2026-09-11T17:42:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0125", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-09-11T17:42:00+07:00", "expiryAt": "2026-09-11T17:42:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-11T17:02:00+07:00",
    "updatedAt": "2026-09-11T17:42:00+07:00"
  },
  {
    "id": "t_seed_0120",
    "billNo": "PK20260911-130100-0120",
    "plateNo": "7ขก7151",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-11T13:01:00+07:00",
    "exitAt": "2026-09-11T14:24:00+07:00",
    "exitTimeLimit": "2026-09-11T14:45:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0126", "method": "promptpay", "channel": "kiosk", "paidAmount": 40, "paidAt": "2026-09-11T14:15:00+07:00", "expiryAt": "2026-09-11T14:45:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-11T13:01:00+07:00",
    "updatedAt": "2026-09-11T14:24:00+07:00"
  },
  {
    "id": "t_seed_0121",
    "billNo": "PK20260911-074800-0121",
    "plateNo": "7กค8254",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-11T07:48:00+07:00",
    "exitAt": "2026-09-11T15:56:00+07:00",
    "exitTimeLimit": "2026-09-11T16:17:00+07:00",
    "amount": 100,
    "netAmount": 100,
    "totalPaid": 100,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0127", "method": "cash", "channel": "cashier", "paidAmount": 100, "paidAt": "2026-09-11T15:47:00+07:00", "expiryAt": "2026-09-11T16:17:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-11T07:48:00+07:00",
    "updatedAt": "2026-09-11T15:56:00+07:00"
  },
  {
    "id": "t_seed_0122",
    "billNo": "PK20260912-062500-0122",
    "plateNo": "9ขก8546",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-12T06:25:00+07:00",
    "exitAt": "2026-09-14T01:17:00+07:00",
    "exitTimeLimit": "2026-09-14T01:42:00+07:00",
    "amount": 700,
    "netAmount": 700,
    "totalPaid": 700,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0128", "method": "promptpay", "channel": "mobile", "paidAmount": 700, "paidAt": "2026-09-14T01:12:00+07:00", "expiryAt": "2026-09-14T01:42:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-09-12T06:25:00+07:00",
    "updatedAt": "2026-09-14T01:17:00+07:00"
  },
  {
    "id": "t_seed_0123",
    "billNo": "PK20260912-140800-0123",
    "plateNo": "5กข1929",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-12T14:08:00+07:00",
    "exitAt": "2026-09-12T22:14:00+07:00",
    "exitTimeLimit": "2026-09-12T22:30:00+07:00",
    "amount": 100,
    "netAmount": 100,
    "totalPaid": 100,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0129", "method": "promptpay", "channel": "mobile", "paidAmount": 100, "paidAt": "2026-09-12T22:00:00+07:00", "expiryAt": "2026-09-12T22:30:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-09-12T14:08:00+07:00",
    "updatedAt": "2026-09-12T22:14:00+07:00"
  },
  {
    "id": "t_seed_0124",
    "billNo": "PK20260914-110700-0124",
    "plateNo": "2งจ9817",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-14T11:07:00+07:00",
    "exitAt": "2026-09-14T13:49:00+07:00",
    "exitTimeLimit": "2026-09-14T13:49:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0130", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-09-14T11:53:00+07:00", "expiryAt": "2026-09-14T12:23:00+07:00", "source": "mobile", "processedBy": "mobile_user"},
      {"id": "pay_seed_0131", "method": "promptpay", "channel": "gate", "paidAmount": 30, "paidAt": "2026-09-14T13:49:00+07:00", "expiryAt": "2026-09-14T13:49:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-14T11:07:00+07:00",
    "updatedAt": "2026-09-14T13:49:00+07:00"
  },
  {
    "id": "t_seed_0125",
    "billNo": "PK20260914-072400-0125",
    "plateNo": "6ขก9271",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-14T07:24:00+07:00",
    "exitAt": "2026-09-14T11:10:00+07:00",
    "exitTimeLimit": "2026-09-14T11:33:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0132", "method": "cash", "channel": "cashier", "paidAmount": 60, "paidAt": "2026-09-14T11:03:00+07:00", "expiryAt": "2026-09-14T11:33:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-14T07:24:00+07:00",
    "updatedAt": "2026-09-14T11:10:00+07:00"
  },
  {
    "id": "t_seed_0126",
    "billNo": "PK20260914-174900-0126",
    "plateNo": "1คง319",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-09-14T17:49:00+07:00",
    "exitAt": "2026-09-14T20:07:00+07:00",
    "exitTimeLimit": "2026-09-14T20:07:00+07:00",
    "amount": 25,
    "netAmount": 25,
    "totalPaid": 25,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0133", "method": "promptpay", "channel": "kiosk", "paidAmount": 10, "paidAt": "2026-09-14T18:49:00+07:00", "expiryAt": "2026-09-14T19:19:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"},
      {"id": "pay_seed_0134", "method": "promptpay", "channel": "gate", "paidAmount": 15, "paidAt": "2026-09-14T20:07:00+07:00", "expiryAt": "2026-09-14T20:07:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-14T17:49:00+07:00",
    "updatedAt": "2026-09-14T20:07:00+07:00"
  },
  {
    "id": "t_seed_0127",
    "billNo": "PK20260915-105000-0127",
    "plateNo": "2งจ905",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-09-15T10:50:00+07:00",
    "exitAt": "2026-09-15T12:15:00+07:00",
    "exitTimeLimit": "2026-09-15T12:41:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0135", "method": "promptpay", "channel": "kiosk", "paidAmount": 20, "paidAt": "2026-09-15T12:11:00+07:00", "expiryAt": "2026-09-15T12:41:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-15T10:50:00+07:00",
    "updatedAt": "2026-09-15T12:15:00+07:00"
  },
  {
    "id": "t_seed_0128",
    "billNo": "PK20260916-145700-0128",
    "plateNo": "6ฬอ7854",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-16T14:57:00+07:00",
    "exitAt": "2026-09-17T01:49:00+07:00",
    "exitTimeLimit": "2026-09-17T02:08:00+07:00",
    "amount": 260,
    "netAmount": 260,
    "totalPaid": 260,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0136", "method": "cash", "channel": "cashier", "paidAmount": 260, "paidAt": "2026-09-17T01:38:00+07:00", "expiryAt": "2026-09-17T02:08:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-09-16T14:57:00+07:00",
    "updatedAt": "2026-09-17T01:49:00+07:00"
  },
  {
    "id": "t_seed_0129",
    "billNo": "PK20260916-123600-0129",
    "plateNo": "3ฮก9415",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-16T12:36:00+07:00",
    "exitAt": "2026-09-16T15:46:00+07:00",
    "exitTimeLimit": "2026-09-16T15:57:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0137", "method": "promptpay", "channel": "cashier", "paidAmount": 50, "paidAt": "2026-09-16T15:27:00+07:00", "expiryAt": "2026-09-16T15:57:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-09-16T12:36:00+07:00",
    "updatedAt": "2026-09-16T15:46:00+07:00"
  },
  {
    "id": "t_seed_0130",
    "billNo": "PK20260916-070200-0130",
    "plateNo": "4กค6483",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-16T07:02:00+07:00",
    "exitAt": "2026-09-16T07:50:00+07:00",
    "exitTimeLimit": "2026-09-16T08:04:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0138", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-09-16T07:34:00+07:00", "expiryAt": "2026-09-16T08:04:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-16T07:02:00+07:00",
    "updatedAt": "2026-09-16T07:50:00+07:00"
  },
  {
    "id": "t_seed_0131",
    "billNo": "PK20260917-075500-0131",
    "plateNo": "5กข538",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-09-17T07:55:00+07:00",
    "exitAt": "2026-09-17T12:21:00+07:00",
    "exitTimeLimit": "2026-09-17T12:45:00+07:00",
    "amount": 35,
    "netAmount": 35,
    "totalPaid": 35,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0139", "method": "promptpay", "channel": "kiosk", "paidAmount": 35, "paidAt": "2026-09-17T12:15:00+07:00", "expiryAt": "2026-09-17T12:45:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-17T07:55:00+07:00",
    "updatedAt": "2026-09-17T12:21:00+07:00"
  },
  {
    "id": "t_seed_0132",
    "billNo": "PK20260917-110600-0132",
    "plateNo": "7บย5234",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-17T11:06:00+07:00",
    "exitAt": "2026-09-17T11:45:00+07:00",
    "exitTimeLimit": "2026-09-17T12:07:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0140", "method": "promptpay", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-09-17T11:37:00+07:00", "expiryAt": "2026-09-17T12:07:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-17T11:06:00+07:00",
    "updatedAt": "2026-09-17T11:45:00+07:00"
  },
  {
    "id": "t_seed_0133",
    "billNo": "PK20260917-162000-0133",
    "plateNo": "1วศ4693",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-17T16:20:00+07:00",
    "exitAt": "2026-09-17T17:03:00+07:00",
    "exitTimeLimit": "2026-09-17T17:18:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0141", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-09-17T16:48:00+07:00", "expiryAt": "2026-09-17T17:18:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-17T16:20:00+07:00",
    "updatedAt": "2026-09-17T17:03:00+07:00"
  },
  {
    "id": "t_seed_0134",
    "billNo": "PK20260918-115300-0134",
    "plateNo": "6ฮก2759",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-18T11:53:00+07:00",
    "exitAt": "2026-09-18T15:51:00+07:00",
    "exitTimeLimit": "2026-09-18T16:06:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0142", "method": "cash", "channel": "cashier", "paidAmount": 60, "paidAt": "2026-09-18T15:36:00+07:00", "expiryAt": "2026-09-18T16:06:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-18T11:53:00+07:00",
    "updatedAt": "2026-09-18T15:51:00+07:00"
  },
  {
    "id": "t_seed_0135",
    "billNo": "PK20260919-175500-0135",
    "plateNo": "4กค7925",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-19T17:55:00+07:00",
    "exitAt": "2026-09-19T20:17:00+07:00",
    "exitTimeLimit": "2026-09-19T20:32:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0143", "method": "promptpay", "channel": "kiosk", "paidAmount": 50, "paidAt": "2026-09-19T20:02:00+07:00", "expiryAt": "2026-09-19T20:32:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-19T17:55:00+07:00",
    "updatedAt": "2026-09-19T20:17:00+07:00"
  },
  {
    "id": "t_seed_0136",
    "billNo": "PK20260919-121300-0136",
    "plateNo": "3งจ573",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-09-19T12:13:00+07:00",
    "exitAt": "2026-09-19T14:24:00+07:00",
    "exitTimeLimit": "2026-09-19T14:34:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0144", "method": "promptpay", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-09-19T14:04:00+07:00", "expiryAt": "2026-09-19T14:34:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-19T12:13:00+07:00",
    "updatedAt": "2026-09-19T14:24:00+07:00"
  },
  {
    "id": "t_seed_0137",
    "billNo": "PK20260921-143800-0137",
    "plateNo": "5กข9709",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-21T14:38:00+07:00",
    "exitAt": "2026-09-22T02:07:00+07:00",
    "exitTimeLimit": "2026-09-22T02:17:00+07:00",
    "amount": 260,
    "netAmount": 260,
    "totalPaid": 260,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0145", "method": "promptpay", "channel": "mobile", "paidAmount": 260, "paidAt": "2026-09-22T01:47:00+07:00", "expiryAt": "2026-09-22T02:17:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-09-21T14:38:00+07:00",
    "updatedAt": "2026-09-22T02:07:00+07:00"
  },
  {
    "id": "t_seed_0138",
    "billNo": "PK20260922-074200-0138",
    "plateNo": "7รล6618",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-22T07:42:00+07:00",
    "exitAt": "2026-09-22T08:49:00+07:00",
    "exitTimeLimit": "2026-09-22T09:12:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0146", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-09-22T08:42:00+07:00", "expiryAt": "2026-09-22T09:12:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-22T07:42:00+07:00",
    "updatedAt": "2026-09-22T08:49:00+07:00"
  },
  {
    "id": "t_seed_0139",
    "billNo": "PK20260922-101600-0139",
    "plateNo": "7กข9877",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-22T10:16:00+07:00",
    "exitAt": "2026-09-22T10:59:00+07:00",
    "exitTimeLimit": "2026-09-22T11:23:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0147", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-09-22T10:53:00+07:00", "expiryAt": "2026-09-22T11:23:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-09-22T10:16:00+07:00",
    "updatedAt": "2026-09-22T10:59:00+07:00"
  },
  {
    "id": "t_seed_0140",
    "billNo": "PK20260923-181100-0140",
    "plateNo": "4ฮก7799",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-23T18:11:00+07:00",
    "exitAt": "2026-09-23T21:51:00+07:00",
    "exitTimeLimit": "2026-09-23T22:08:00+07:00",
    "amount": 60,
    "netAmount": 60,
    "totalPaid": 60,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0148", "method": "cash", "channel": "cashier", "paidAmount": 60, "paidAt": "2026-09-23T21:38:00+07:00", "expiryAt": "2026-09-23T22:08:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-09-23T18:11:00+07:00",
    "updatedAt": "2026-09-23T21:51:00+07:00"
  },
  {
    "id": "t_seed_0141",
    "billNo": "PK20260924-123300-0141",
    "plateNo": "4ฒท8022",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-24T12:33:00+07:00",
    "exitAt": "2026-09-24T13:31:00+07:00",
    "exitTimeLimit": "2026-09-24T13:31:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0149", "method": "promptpay", "channel": "gate", "paidAmount": 20, "paidAt": "2026-09-24T13:31:00+07:00", "expiryAt": "2026-09-24T13:31:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-24T12:33:00+07:00",
    "updatedAt": "2026-09-24T13:31:00+07:00"
  },
  {
    "id": "t_seed_0142",
    "billNo": "PK20260924-120400-0142",
    "plateNo": "1บย6955",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-24T12:04:00+07:00",
    "exitAt": "2026-09-24T17:46:00+07:00",
    "exitTimeLimit": "2026-09-24T18:10:00+07:00",
    "amount": 80,
    "netAmount": 80,
    "totalPaid": 80,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0150", "method": "cash", "channel": "cashier", "paidAmount": 80, "paidAt": "2026-09-24T17:40:00+07:00", "expiryAt": "2026-09-24T18:10:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-24T12:04:00+07:00",
    "updatedAt": "2026-09-24T17:46:00+07:00"
  },
  {
    "id": "t_seed_0143",
    "billNo": "PK20260925-133500-0143",
    "plateNo": "5กข538",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-09-25T13:35:00+07:00",
    "exitAt": "2026-09-25T15:20:00+07:00",
    "exitTimeLimit": "2026-09-25T15:32:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0151", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-09-25T15:02:00+07:00", "expiryAt": "2026-09-25T15:32:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-09-25T13:35:00+07:00",
    "updatedAt": "2026-09-25T15:20:00+07:00"
  },
  {
    "id": "t_seed_0144",
    "billNo": "PK20260925-060400-0144",
    "plateNo": "3คง5682",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-25T06:04:00+07:00",
    "exitAt": "2026-09-25T16:33:00+07:00",
    "exitTimeLimit": "2026-09-25T16:54:00+07:00",
    "amount": 130,
    "netAmount": 130,
    "totalPaid": 130,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0152", "method": "cash", "channel": "cashier", "paidAmount": 130, "paidAt": "2026-09-25T16:24:00+07:00", "expiryAt": "2026-09-25T16:54:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-25T06:04:00+07:00",
    "updatedAt": "2026-09-25T16:33:00+07:00"
  },
  {
    "id": "t_seed_0145",
    "billNo": "PK20260925-150400-0145",
    "plateNo": "9รล9853",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-25T15:04:00+07:00",
    "exitAt": "2026-09-25T19:56:00+07:00",
    "exitTimeLimit": "2026-09-25T20:10:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0153", "method": "promptpay", "channel": "kiosk", "paidAmount": 70, "paidAt": "2026-09-25T19:40:00+07:00", "expiryAt": "2026-09-25T20:10:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-25T15:04:00+07:00",
    "updatedAt": "2026-09-25T19:56:00+07:00"
  },
  {
    "id": "t_seed_0146",
    "billNo": "PK20260926-112200-0146",
    "plateNo": "5กข9709",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-26T11:22:00+07:00",
    "exitAt": "2026-09-26T12:31:00+07:00",
    "exitTimeLimit": "2026-09-26T12:43:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0154", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-09-26T12:13:00+07:00", "expiryAt": "2026-09-26T12:43:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-09-26T11:22:00+07:00",
    "updatedAt": "2026-09-26T12:31:00+07:00"
  },
  {
    "id": "t_seed_0147",
    "billNo": "PK20260927-065400-0147",
    "plateNo": "1วศ4693",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-27T06:54:00+07:00",
    "exitAt": "2026-09-27T18:42:00+07:00",
    "exitTimeLimit": "2026-09-27T18:42:00+07:00",
    "amount": 140,
    "netAmount": 140,
    "totalPaid": 140,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0155", "method": "promptpay", "channel": "gate", "paidAmount": 140, "paidAt": "2026-09-27T18:42:00+07:00", "expiryAt": "2026-09-27T18:42:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-27T06:54:00+07:00",
    "updatedAt": "2026-09-27T18:42:00+07:00"
  },
  {
    "id": "t_seed_0148",
    "billNo": "PK20260927-184200-0148",
    "plateNo": "7ขก7151",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-27T18:42:00+07:00",
    "exitAt": "2026-09-27T20:08:00+07:00",
    "exitTimeLimit": "2026-09-27T20:08:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0156", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-09-27T20:08:00+07:00", "expiryAt": "2026-09-27T20:08:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-27T18:42:00+07:00",
    "updatedAt": "2026-09-27T20:08:00+07:00"
  },
  {
    "id": "t_seed_0149",
    "billNo": "PK20260928-183700-0149",
    "plateNo": "4วศ7277",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-28T18:37:00+07:00",
    "exitAt": "2026-09-29T01:00:00+07:00",
    "exitTimeLimit": "2026-09-29T01:00:00+07:00",
    "amount": 200,
    "netAmount": 200,
    "totalPaid": 200,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0157", "method": "promptpay", "channel": "mobile", "paidAmount": 60, "paidAt": "2026-09-28T22:35:00+07:00", "expiryAt": "2026-09-28T23:05:00+07:00", "source": "mobile", "processedBy": "mobile_user"},
      {"id": "pay_seed_0158", "method": "promptpay", "channel": "gate", "paidAmount": 140, "paidAt": "2026-09-29T01:00:00+07:00", "expiryAt": "2026-09-29T01:00:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-28T18:37:00+07:00",
    "updatedAt": "2026-09-29T01:00:00+07:00"
  },
  {
    "id": "t_seed_0150",
    "billNo": "PK20260928-114300-0150",
    "plateNo": "6รล3564",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-28T11:43:00+07:00",
    "exitAt": "2026-09-28T16:19:00+07:00",
    "exitTimeLimit": "2026-09-28T16:38:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0159", "method": "cash", "channel": "cashier", "paidAmount": 70, "paidAt": "2026-09-28T16:08:00+07:00", "expiryAt": "2026-09-28T16:38:00+07:00", "source": "admin", "processedBy": "u1"}
    ],
    "createdAt": "2026-09-28T11:43:00+07:00",
    "updatedAt": "2026-09-28T16:19:00+07:00"
  },
  {
    "id": "t_seed_0151",
    "billNo": "PK20260929-205200-0151",
    "plateNo": "1กข190",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-09-29T20:52:00+07:00",
    "exitAt": "2026-09-30T00:25:00+07:00",
    "exitTimeLimit": "2026-09-30T00:35:00+07:00",
    "amount": 90,
    "netAmount": 90,
    "totalPaid": 90,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0160", "method": "promptpay", "channel": "cashier", "paidAmount": 90, "paidAt": "2026-09-30T00:05:00+07:00", "expiryAt": "2026-09-30T00:35:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-09-29T20:52:00+07:00",
    "updatedAt": "2026-09-30T00:25:00+07:00"
  },
  {
    "id": "t_seed_0152",
    "billNo": "PK20260929-203800-0152",
    "plateNo": "7สห8102",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-29T20:38:00+07:00",
    "exitAt": "2026-09-30T01:22:00+07:00",
    "exitTimeLimit": "2026-09-30T01:34:00+07:00",
    "amount": 200,
    "netAmount": 200,
    "totalPaid": 200,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0161", "method": "promptpay", "channel": "kiosk", "paidAmount": 200, "paidAt": "2026-09-30T01:04:00+07:00", "expiryAt": "2026-09-30T01:34:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-29T20:38:00+07:00",
    "updatedAt": "2026-09-30T01:22:00+07:00"
  },
  {
    "id": "t_seed_0153",
    "billNo": "PK20260929-180800-0153",
    "plateNo": "3วศ1240",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-29T18:08:00+07:00",
    "exitAt": "2026-09-29T18:39:00+07:00",
    "exitTimeLimit": "2026-09-29T19:01:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0162", "method": "promptpay", "channel": "kiosk", "paidAmount": 20, "paidAt": "2026-09-29T18:31:00+07:00", "expiryAt": "2026-09-29T19:01:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-09-29T18:08:00+07:00",
    "updatedAt": "2026-09-29T18:39:00+07:00"
  },
  {
    "id": "t_seed_0154",
    "billNo": "PK20260930-070100-0154",
    "plateNo": "5กข1929",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-30T07:01:00+07:00",
    "exitAt": "2026-09-30T11:19:00+07:00",
    "exitTimeLimit": "2026-09-30T11:19:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0163", "method": "promptpay", "channel": "gate", "paidAmount": 70, "paidAt": "2026-09-30T11:19:00+07:00", "expiryAt": "2026-09-30T11:19:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-09-30T07:01:00+07:00",
    "updatedAt": "2026-09-30T11:19:00+07:00"
  },
  {
    "id": "t_seed_0155",
    "billNo": "PK20260930-110700-0155",
    "plateNo": "1บย6955",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-09-30T11:07:00+07:00",
    "exitAt": "2026-09-30T13:55:00+07:00",
    "exitTimeLimit": "2026-09-30T14:06:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0164", "method": "cash", "channel": "cashier", "paidAmount": 50, "paidAt": "2026-09-30T13:36:00+07:00", "expiryAt": "2026-09-30T14:06:00+07:00", "source": "admin", "processedBy": "u4"}
    ],
    "createdAt": "2026-09-30T11:07:00+07:00",
    "updatedAt": "2026-09-30T13:55:00+07:00"
  }
];

// Mock ข้อมูลรถเดือนตุลาคม 2026 (1 - 5 ต.ค. วันนี้ 5 ต.ค. มีรถจ่ายแล้วรอออกและรถที่ยังจอดอยู่) 16 รายการ
const october2026: Prisma.TransactionCreateInput[] = [
  {
    "id": "t_seed_0156",
    "billNo": "PK20261001-171000-0156",
    "plateNo": "9ขก8546",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-01T17:10:00+07:00",
    "exitAt": "2026-10-03T01:20:00+07:00",
    "exitTimeLimit": "2026-10-03T01:44:00+07:00",
    "amount": 590,
    "netAmount": 590,
    "totalPaid": 590,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0165", "method": "promptpay", "channel": "mobile", "paidAmount": 590, "paidAt": "2026-10-03T01:14:00+07:00", "expiryAt": "2026-10-03T01:44:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-10-01T17:10:00+07:00",
    "updatedAt": "2026-10-03T01:20:00+07:00"
  },
  {
    "id": "t_seed_0157",
    "billNo": "PK20261001-144000-0157",
    "plateNo": "9นม2950",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-01T14:40:00+07:00",
    "exitAt": "2026-10-01T18:48:00+07:00",
    "exitTimeLimit": "2026-10-01T19:12:00+07:00",
    "amount": 70,
    "netAmount": 70,
    "totalPaid": 70,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0166", "method": "promptpay", "channel": "mobile", "paidAmount": 70, "paidAt": "2026-10-01T18:42:00+07:00", "expiryAt": "2026-10-01T19:12:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-10-01T14:40:00+07:00",
    "updatedAt": "2026-10-01T18:48:00+07:00"
  },
  {
    "id": "t_seed_0158",
    "billNo": "PK20261002-080700-0158",
    "plateNo": "5กข9709",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-02T08:07:00+07:00",
    "exitAt": "2026-10-02T09:57:00+07:00",
    "exitTimeLimit": "2026-10-02T09:57:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0167", "method": "promptpay", "channel": "gate", "paidAmount": 40, "paidAt": "2026-10-02T09:57:00+07:00", "expiryAt": "2026-10-02T09:57:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-10-02T08:07:00+07:00",
    "updatedAt": "2026-10-02T09:57:00+07:00"
  },
  {
    "id": "t_seed_0159",
    "billNo": "PK20261002-123800-0159",
    "plateNo": "6งจ5524",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-02T12:38:00+07:00",
    "exitAt": "2026-10-04T12:26:00+07:00",
    "exitTimeLimit": "2026-10-04T12:26:00+07:00",
    "amount": 750,
    "netAmount": 750,
    "totalPaid": 750,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0168", "method": "promptpay", "channel": "gate", "paidAmount": 750, "paidAt": "2026-10-04T12:26:00+07:00", "expiryAt": "2026-10-04T12:26:00+07:00", "source": "barrier_gate", "processedBy": "barrier_gate_G-SEED-OUT", "deviceId": "G-SEED-OUT", "deviceType": "barrier_gate", "deviceName": "Exit Gate 1", "deviceLocation": "Exit A"}
    ],
    "createdAt": "2026-10-02T12:38:00+07:00",
    "updatedAt": "2026-10-04T12:26:00+07:00"
  },
  {
    "id": "t_seed_0160",
    "billNo": "PK20261003-173600-0160",
    "plateNo": "3คง5682",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-03T17:36:00+07:00",
    "status": "cancelled",
    "payments": [],
    "createdAt": "2026-10-03T17:36:00+07:00",
    "updatedAt": "2026-10-03T18:00:00+07:00"
  },
  {
    "id": "t_seed_0161",
    "billNo": "PK20261004-185300-0161",
    "plateNo": "6ขก9271",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-04T18:53:00+07:00",
    "exitAt": "2026-10-04T19:22:00+07:00",
    "exitTimeLimit": "2026-10-04T19:45:00+07:00",
    "amount": 20,
    "netAmount": 20,
    "totalPaid": 20,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0169", "method": "promptpay", "channel": "mobile", "paidAmount": 20, "paidAt": "2026-10-04T19:15:00+07:00", "expiryAt": "2026-10-04T19:45:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-10-04T18:53:00+07:00",
    "updatedAt": "2026-10-04T19:22:00+07:00"
  },
  {
    "id": "t_seed_0162",
    "billNo": "PK20261003-194000-0162",
    "plateNo": "7สห1511",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-03T19:40:00+07:00",
    "status": "pending",
    "payments": [],
    "createdAt": "2026-10-03T19:40:00+07:00",
    "updatedAt": "2026-10-03T19:40:00+07:00"
  },
  {
    "id": "t_seed_0163",
    "billNo": "PK20261004-170500-0163",
    "plateNo": "2บย7786",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-04T17:05:00+07:00",
    "exitTimeLimit": "2026-10-04T19:40:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 20,
    "status": "partially_paid",
    "payments": [
      {"id": "pay_seed_0170", "method": "cash", "channel": "cashier", "paidAmount": 20, "paidAt": "2026-10-04T19:10:00+07:00", "expiryAt": "2026-10-04T19:40:00+07:00", "source": "admin", "processedBy": "u2"}
    ],
    "createdAt": "2026-10-04T17:05:00+07:00",
    "updatedAt": "2026-10-04T19:10:00+07:00"
  },
  {
    "id": "t_seed_0164",
    "billNo": "PK20261005-061000-0164",
    "plateNo": "1คง1057",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-05T06:10:00+07:00",
    "exitAt": "2026-10-05T07:45:00+07:00",
    "exitTimeLimit": "2026-10-05T08:11:00+07:00",
    "amount": 40,
    "netAmount": 40,
    "totalPaid": 40,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0171", "method": "promptpay", "channel": "mobile", "paidAmount": 40, "paidAt": "2026-10-05T07:41:00+07:00", "expiryAt": "2026-10-05T08:11:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-10-05T06:10:00+07:00",
    "updatedAt": "2026-10-05T07:45:00+07:00"
  },
  {
    "id": "t_seed_0165",
    "billNo": "PK20261005-064000-0165",
    "plateNo": "3งจ573",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-10-05T06:40:00+07:00",
    "exitAt": "2026-10-05T07:30:00+07:00",
    "exitTimeLimit": "2026-10-05T07:44:00+07:00",
    "amount": 10,
    "netAmount": 10,
    "totalPaid": 10,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0172", "method": "promptpay", "channel": "mobile", "paidAmount": 10, "paidAt": "2026-10-05T07:14:00+07:00", "expiryAt": "2026-10-05T07:44:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-10-05T06:40:00+07:00",
    "updatedAt": "2026-10-05T07:30:00+07:00"
  },
  {
    "id": "t_seed_0166",
    "billNo": "PK20261005-070500-0166",
    "plateNo": "7รล6618",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-05T07:05:00+07:00",
    "exitAt": "2026-10-05T09:15:00+07:00",
    "exitTimeLimit": "2026-10-05T09:40:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "completed",
    "payments": [
      {"id": "pay_seed_0173", "method": "promptpay", "channel": "kiosk", "paidAmount": 50, "paidAt": "2026-10-05T09:10:00+07:00", "expiryAt": "2026-10-05T09:40:00+07:00", "source": "kiosk", "processedBy": "kiosk_K-SEED-001", "deviceId": "K-SEED-001", "deviceType": "kiosk", "deviceName": "Payment Kiosk 1", "deviceLocation": "Lobby A"}
    ],
    "createdAt": "2026-10-05T07:05:00+07:00",
    "updatedAt": "2026-10-05T09:15:00+07:00"
  },
  {
    "id": "t_seed_0167",
    "billNo": "PK20261005-073000-0167",
    "plateNo": "6รล3564",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-05T07:30:00+07:00",
    "exitTimeLimit": "2026-10-05T10:15:00+07:00",
    "amount": 50,
    "netAmount": 50,
    "totalPaid": 50,
    "status": "paid_waiting_exit",
    "payments": [
      {"id": "pay_seed_0174", "method": "promptpay", "channel": "mobile", "paidAmount": 50, "paidAt": "2026-10-05T09:45:00+07:00", "expiryAt": "2026-10-05T10:15:00+07:00", "source": "mobile", "processedBy": "mobile_user"}
    ],
    "createdAt": "2026-10-05T07:30:00+07:00",
    "updatedAt": "2026-10-05T09:45:00+07:00"
  },
  {
    "id": "t_seed_0168",
    "billNo": "PK20261005-081500-0168",
    "plateNo": "3วศ1240",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-05T08:15:00+07:00",
    "status": "pending",
    "payments": [],
    "createdAt": "2026-10-05T08:15:00+07:00",
    "updatedAt": "2026-10-05T08:15:00+07:00"
  },
  {
    "id": "t_seed_0169",
    "billNo": "PK20261005-085000-0169",
    "plateNo": "9รล9853",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-05T08:50:00+07:00",
    "status": "pending",
    "payments": [],
    "createdAt": "2026-10-05T08:50:00+07:00",
    "updatedAt": "2026-10-05T08:50:00+07:00"
  },
  {
    "id": "t_seed_0170",
    "billNo": "PK20261005-092000-0170",
    "plateNo": "3งจ573",
    "vehicleType": "motorcycle",
    "serviceType": "parking",
    "entryAt": "2026-10-05T09:20:00+07:00",
    "status": "pending",
    "payments": [],
    "createdAt": "2026-10-05T09:20:00+07:00",
    "updatedAt": "2026-10-05T09:20:00+07:00"
  },
  {
    "id": "t_seed_0171",
    "billNo": "PK20261005-095500-0171",
    "plateNo": "3ฉช9505",
    "vehicleType": "car",
    "serviceType": "parking",
    "entryAt": "2026-10-05T09:55:00+07:00",
    "status": "pending",
    "payments": [],
    "createdAt": "2026-10-05T09:55:00+07:00",
    "updatedAt": "2026-10-05T09:55:00+07:00"
  }
];

// Mock ข้อมูลรถทั้งหมดรวมทุกเดือน
const transactions: Prisma.TransactionCreateInput[] = [...july2026, ...august2026, ...september2026, ...october2026];

/* -------------------------------------- Functions -------------------------------------- */

// Function upsert ข้อมูลรถทดสอบ รันซ้ำจะรีเซ็ตรายการเหล่านี้กลับเป็นค่าในไฟล์นี้
async function main(): Promise<void> {
  for (const transaction of transactions) {
    await prisma.transaction.upsert({
      where: { id: transaction.id },
      create: transaction,
      update: transaction
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
