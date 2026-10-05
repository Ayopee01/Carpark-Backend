# Smart Carpark API

Backend API ของระบบ Smart Carpark รองรับการทำงานของ Admin, กล้อง LPR, Kiosk, Barrier Gate และการชำระเงินผ่านมือถือ (QR PromptPay ผ่าน Omise)

## Tech Stack

| ส่วน | เทคโนโลยี |
| --- | --- |
| Runtime | Node.js 20 (20.19 ขึ้นไป) |
| Language | TypeScript (strict, compile เป็น CommonJS) |
| Framework | Express 5 |
| Database | PostgreSQL 16 + Prisma 7 (`@prisma/adapter-pg`) |
| Realtime | Server-Sent Events (SSE), WebSocket |
| Deployment | Docker Compose, GitHub Actions, GitHub Container Registry (GHCR) |

## โครงสร้างโปรเจกต์

```text
src/
  routes/          รับ request แล้วเรียก service
  services/        business logic
  repositories/    Prisma data access
  validation/      zod schemas
  realtime/        SSE และ payment WebSocket
  middlewares/     auth, permission, device auth, rate limit, error handler
  docs/openapi/    OpenAPI spec
prisma/
  schema.prisma    database schema
  migrations/      migration files
  seed/            seed data
test/              unit tests
scripts/           deploy.sh, backup.sh
```

## Environment Variables

คัดลอก `.env.example` เป็น `.env` แล้วกำหนดค่าตาม environment

| Variable | จำเป็น | คำอธิบาย |
| --- | --- | --- |
| `PORT` | ✓ | Port ของ API เช่น `8080` |
| `TRUST_PROXY` | ✓ | จำนวนชั้น reverse proxy หน้า API เช่น `1` (nginx ชั้นเดียว) |
| `ADMIN_ORIGINS` | ✓ | Origin ของ Admin Frontend ที่ใช้ session cookie คั่นด้วย `,` (origin ตรงตัว ห้ามใช้ `*`) |
| `CLIENT_ORIGINS` | ✓ | (เดิมชื่อ `CORS_ORIGINS`) Origin ของ Kiosk/Barrier Gate/Mobile ที่เรียก `/api/client` จาก browser (ไม่ใช้ cookie) คั่นด้วย `,` (`*` = ทุก origin นอก production) |
| `AUTH_COOKIE_INSECURE` | | `true` = auth cookie ไม่ใส่ Secure สำหรับ dev บน http (production ห้ามตั้ง ระบบไม่ยอม start) |
| `AUTH_TOKEN_SECRET` | ✓ | Secret สำหรับ sign token บน production ห้ามใช้ `change-me` |
| `REALTIME_PING_INTERVAL_MS` | ✓ | ระยะ ping ของ SSE/WebSocket เช่น `25000` (ต้องน้อยกว่า proxy timeout) |
| `LOGIN_RATE_LIMIT` | ✓ | จำนวน login ผิดต่อ 15 นาที เช่น `10` |
| `ACTIVATION_RATE_LIMIT` | ✓ | จำนวน activate device ต่อ 15 นาที เช่น `20` |
| `PUBLIC_CLIENT_RATE_LIMIT` | ✓ | จำนวน request ของ client/mobile ต่อนาที เช่น `120` |
| `UPLOADS_HOST_PATH` | | โฟลเดอร์บน host สำหรับเก็บไฟล์ upload (default `./uploads`) |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | ✓ | ข้อมูล database ของ container `db` |
| `DATABASE_URL` | ✓ (local) | Connection string ตอนรัน API หรือ seed นอก Docker (ใน Docker compose กำหนดให้อัตโนมัติ) |
| `OMISE_SECRET_KEY`, `OMISE_WEBHOOK_SECRET` | ✓ (ถ้าใช้ Omise) | Key ของ Omise บน production ที่ตั้ง secret key ต้องตั้ง webhook secret ด้วย (frontend ไม่ต้องใช้ public key) |
| `OMISE_CURRENCY`, `OMISE_QR_EXPIRY_MINUTES` | ✓ | สกุลเงินรหัส 3 ตัว เช่น `thb` และอายุ QR 1-1440 นาที เช่น `10` |
| `ENABLE_PAYMENT_SIMULATION`, `PAYMENT_SIMULATION_TOKEN` | | โหมดทดสอบการจ่ายเงิน ต้องเป็น `false` บน production |

API จะตรวจค่า env ตอน start ถ้าค่าที่จำเป็นขาดหรือไม่ถูกต้อง จะหยุดทำงานพร้อมแจ้งชื่อตัวแปรที่ผิด (ไม่มีค่า default ให้ ต้องตั้งเองทุกตัวที่มี ✓) ส่วน `npm test` ใช้ค่าจาก `test/support/test.env`

## Local Development

```bash
npm install
docker compose up -d db        # PostgreSQL ที่ localhost:5433
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run dev                    # http://localhost:8080
```

ตรวจสอบโค้ดก่อน commit:

```bash
npx tsc -p test/tsconfig.json --noEmit
npm test
```

## Seed Data

| คำสั่ง | ไฟล์ | ข้อมูล | Environment |
| --- | --- | --- | --- |
| `npm run db:seed` | `prisma/seed/seed.ts` | Super admin 1 บัญชี และค่าตั้งต้นของ settings | ทุก environment รวม production |
| `npm run db:seed:admin` | `prisma/seed/admin.ts` | บัญชีพนักงานสำหรับทดสอบ | Development / Test เท่านั้น |
| `npm run db:seed:transactions` | `prisma/seed/transactions.ts` | ข้อมูลรถย้อนหลัง 3 เดือน | Development / Test เท่านั้น |

- `db:seed` สร้างเฉพาะข้อมูลที่ยังไม่มี รันซ้ำจะไม่เขียนทับรหัสผ่านหรือ settings ที่แก้ไขแล้ว
- Seed สำหรับทดสอบจะ reset ข้อมูลของตัวเองกลับเป็นค่าในไฟล์ทุกครั้งที่รัน

| Username | Password | Role | ที่มา |
| --- | --- | --- | --- |
| `superadmin` | `123456` | Super Admin | `db:seed` |
| `admin1`, `admin2` | `123` | Staff | `db:seed:admin` |
| `cashier` | `123456` | Staff | `db:seed:admin` |

> **สำคัญ:** หลังรัน `db:seed` บน production ต้องเปลี่ยนรหัสผ่านของ `superadmin` ทันที

## API Documentation

| URL | รายละเอียด |
| --- | --- |
| `/docs` | Swagger UI |
| `/docs/openapi.json` | OpenAPI 3 spec |
| `/health` | Health check ของ API |
| `/health/db` | Health check ของ database |

Postman Collection อยู่ที่ `postman/Smart-Carpark-API.postman_collection.json` ให้กำหนด `baseUrl` แล้วเรียก `Auth > Login` ก่อน ระบบจะบันทึก token ให้อัตโนมัติ

## Deployment

### CI/CD

| Event | การทำงาน |
| --- | --- |
| Pull Request | Typecheck, test, ตรวจ migration และทดสอบ `docker build` |
| Push / merge เข้า `main` | ตรวจเหมือน PR → push image ไป GHCR → deploy Production อัตโนมัติ |

- Deploy จะ SSH เข้า server แล้วรัน `scripts/deploy.sh` เพื่อ pull image และ start container ใหม่ จากนั้นรอให้ API อยู่ในสถานะ healthy (สูงสุด 2 นาที)
- ถ้ายังไม่ได้ตั้ง secret `SSH_HOST` (ยังไม่มี server) job Deploy จะข้ามการ deploy โดยไม่ fail และจะเริ่ม deploy เองเมื่อตั้ง secrets ครบ
- Database migration รันอัตโนมัติทุกครั้งที่ container start
- **Rollback:** GitHub → Actions → **Deploy** → Run workflow แล้วระบุ commit SHA ที่ต้องการ

### GitHub Secrets

ตั้งค่าใน Settings → Environments → `production`

| Secret | คำอธิบาย |
| --- | --- |
| `SSH_HOST` | IP หรือ hostname ของ server |
| `SSH_USER` | User ที่ใช้ deploy (ต้องอยู่ใน group `docker`) |
| `SSH_PRIVATE_KEY` | Private key สำหรับ SSH |
| `DEPLOY_PATH` | Path ของ repo บน server |
| `SSH_PORT` | Port SSH (ไม่บังคับ, default `22`) |
| `SSH_KNOWN_HOSTS` | ผลลัพธ์จาก `ssh-keyscan` (ไม่บังคับ แต่แนะนำ) |

### Server Setup (ครั้งแรก)

```bash
git clone <repo-url> && cd Carpark-Backend
cp .env.example .env                             # กำหนดค่า production
sudo mkdir -p /srv/smart-carpark/uploads         # ตั้ง UPLOADS_HOST_PATH ให้ชี้มาที่นี่
docker compose up -d --build
docker compose exec api npm run db:seed
```

API อยู่ใน Docker network `npm-network` และเปิดใช้งานผ่าน reverse proxy (Nginx Proxy Manager)

> **ห้าม** ใช้ `docker compose down -v` บน production เพราะจะลบ volume ของ database

## Backup

```bash
sh scripts/backup.sh                             # backup database + uploads ไปที่ /srv/smart-carpark/backups
BACKUP_DIR=/mnt/backup KEEP_DAYS=30 sh scripts/backup.sh
```

แนะนำให้ตั้ง cron ทุกวัน และคัดลอกไฟล์ backup ไปเก็บนอก server

```cron
0 3 * * * cd /path/to/Carpark-Backend && sh scripts/backup.sh >> /var/log/smart-carpark-backup.log 2>&1
```

Restore:

```bash
gunzip -c /srv/smart-carpark/backups/db-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
tar -xzf /srv/smart-carpark/backups/uploads-YYYYMMDD-HHMMSS.tar.gz -C /srv/smart-carpark/uploads
```
