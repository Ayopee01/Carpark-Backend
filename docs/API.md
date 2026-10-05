# Smart Carpark API Reference

เอกสารนี้สรุป API ทุกเส้นของ backend สำหรับให้ทีม Admin Frontend และ Client Frontend (Kiosk / Barrier Gate / Mobile) ใช้วิเคราะห์และกำหนด type ฝั่ง frontend
type ทั้งหมดเขียนแบบ TypeScript และสร้างจาก code จริงของ backend (ถ้าเอกสารนี้ขัดกับ `GET /docs/openapi.json` ให้ถือ code และ OpenAPI เป็นหลัก แล้วแจ้ง backend)

- Base URL: `https://<host>` ทุกเส้นขึ้นต้นด้วย `/api` ยกเว้น `/health` และ `/docs`
- รูปแบบข้อมูล: JSON (`Content-Type: application/json`) ยกเว้นที่ระบุ
- วันเวลา: string ISO 8601 แบบ UTC เช่น `"2026-10-01T03:00:00.000Z"` (`DateTimeString`) ส่วนวันที่อย่างเดียวใช้ `"YYYY-MM-DD"` ตามเวลาไทย
- เงิน:
  - เงินใน transaction, payment, dashboard, overview และ EDC เป็น **บาท** (ทศนิยมไม่เกิน 2 ตำแหน่ง)
  - เงินของ Omise (`charge.amount`, `refundAmount`, `pendingAmount`) เป็น **สตางค์** (integer, หาร 100 ก่อนแสดง)
- ทะเบียนรถ: backend ตัดช่องว่าง/ขีด และทำตัวอักษรอังกฤษเป็นตัวใหญ่ให้เอง

## สารบัญ

- [การเปลี่ยนแปลงรอบที่ 5 (2026-10-07): session cookie + CORS สำหรับ Admin Frontend](#การเปลี่ยนแปลงรอบที่-5-2026-10-07-session-cookie--cors-สำหรับ-admin-frontend)
- [การเปลี่ยนแปลงรอบที่ 4 (2026-10-06): WebSocket ticket, ค้นทะเบียนตรงตัว และ validation](#การเปลี่ยนแปลงรอบที่-4-2026-10-06-websocket-ticket-ค้นทะเบียนตรงตัว-และ-validation)
- [การเปลี่ยนแปลงรอบที่ 3 (2026-10-06): โลโก้, logoUrl และ payment WebSocket](#การเปลี่ยนแปลงรอบที่-3-2026-10-06-โลโก้-logourl-และ-payment-websocket)
- [การเปลี่ยนแปลง Route รอบที่ 2 (2026-10-05): ตัด v1 และตั้งชื่อใหม่](#การเปลี่ยนแปลง-route-รอบที่-2-2026-10-05-ตัด-v1-และตั้งชื่อใหม่)
- [การเปลี่ยนแปลง Route รอบที่ 1 (2026-10-05)](#การเปลี่ยนแปลง-route-รอบที่-1-2026-10-05)
1. [Common Types](#1-common-types)
2. [Authentication](#2-authentication)
3. [Auth](#3-auth-apiauth)
4. [Dashboard](#4-dashboard-apidashboard)
5. [Overview](#5-overview-apioverview)
6. [Transactions](#6-transactions-apitransactions)
7. [Payments](#7-payments-apipayments)
8. [Members](#8-members-apimembers)
9. [Pricing](#9-pricing-apipricing)
10. [Payment Settings](#10-payment-settings-apipayment-settings)
11. [Devices](#11-devices-apidevices)
12. [Theme](#12-theme-apitheme)
13. [System Settings](#13-system-settings-apisystem-settings)
14. [Client](#14-client-apiclient)
15. [Payment Gateway](#15-payment-gateway-apipayment-gateway)
16. [Health and Docs](#16-health-and-docs)
17. [Realtime: SSE](#17-realtime-sse)
18. [Realtime: Payment WebSocket](#18-realtime-payment-websocket)
19. [Error Codes](#19-error-codes)
20. [ใครใช้เส้นไหน](#20-ใครใช้เส้นไหน)

---

## การเปลี่ยนแปลงรอบที่ 5 (2026-10-07): session cookie + CORS สำหรับ Admin Frontend

Admin Frontend เรียก API จาก browser ตรง backend เป็นเจ้าของ session cookie (HttpOnly) และคุมด้วย CORS + ตรวจ Origin ดู [2](#2-authentication) และ [3](#3-auth-apiauth)
โหมด Bearer เดิมยังใช้ได้ทุกเส้น (request ที่ไม่มี `Origin`)

| เรื่อง | ใหม่ |
|---|---|
| env | เพิ่ม `ADMIN_ORIGINS` (บังคับ) และ `AUTH_COOKIE_INSECURE` (dev เท่านั้น) และเปลี่ยนชื่อ `CORS_ORIGINS` เป็น `CLIENT_ORIGINS` ซึ่งเหลือแค่ origin ของ Kiosk/Barrier Gate/Mobile สำหรับ `/api/client` |
| CORS | Admin ได้ `Allow-Credentials: true` เฉพาะ origin ใน `ADMIN_ORIGINS`, Kiosk ได้ CORS เฉพาะ `/api/client/*` ไม่มี credentials, preflight cache 600 วินาที, expose `Retry-After` |
| login / refresh | Origin ของ Admin → ตั้ง cookie `__Host-cp_access` + `__Secure-cp_refresh` และ body ไม่มี token, รับ `rememberMe` |
| logout | ใช้ได้แม้ access token หมดอายุ (ระบุ session จาก refresh token), ตอบ 200 และลบ cookie เสมอ |
| Admin route ทุกเส้น | อ่าน access token จาก cookie ได้ (Bearer มาก่อน) และตรวจ CSRF: `403 CSRF_REJECTED`, `415 UNSUPPORTED_MEDIA_TYPE` |
| `WS /api/payments/ws` | browser ต่อด้วย cookie ได้โดยไม่ต้องใช้ ticket/token, Origin นอก `ADMIN_ORIGINS` ปิดด้วย `4403 'origin_not_allowed'` |

---

## การเปลี่ยนแปลงรอบที่ 4 (2026-10-06): WebSocket ticket, ค้นทะเบียนตรงตัว และ validation

| เรื่อง | เดิม | ใหม่ | frontend ต้องแก้ |
|---|---|---|---|
| `POST /api/payments/ws-ticket` (ใหม่) | - | ขอ ticket ใช้ครั้งเดียว อายุ 30 วินาที แล้วต่อ `WS /api/payments/ws?chargeId=&ticket=` ดู [7](#post-apipaymentsws-ticket) และ [18](#18-realtime-payment-websocket) | browser เลิกใส่ access token ใน URL |
| `WS /api/payments/ws?token=` | ใช้ได้ | ยังใช้ได้ชั่วคราว จะเอาออกใน release ถัดไปหลัง Admin Frontend แจ้งว่า deploy แบบ ticket แล้ว (`Authorization: Bearer` ยังใช้ได้) | เปลี่ยนเป็น ticket |
| `GET /api/transactions/:plateNo?exact=true` (ใหม่) | ค้นบางส่วนได้ทะเบียนอื่น | หาเฉพาะทะเบียนที่ตรงทุกตัวอักษร ไม่เจอ = `404 TRANSACTION_NOT_FOUND` ไม่มี `PlateLookupMultiple` | ใช้ `exact=true` ก่อนรับเงิน แล้วเอาการเทียบทะเบียนเองออก |
| `POST /api/payments/charges`, `POST /api/client/payments/charges` | ยอดต่ำกว่าขั้นต่ำได้ error ของ Omise | PromptPay ยอดค้าง < 20 บาท ได้ `400 AMOUNT_BELOW_GATEWAY_MINIMUM` + `{ minimumAmount, remainingAmount }` (บาท) ก่อนเรียก Omise | แสดงข้อความขั้นต่ำ |
| `PUT /api/pricing` `INVALID_PRICING_RULES` | มีแค่ `message` | เพิ่ม `vehicleType`, `ruleIndexes`, `ruleIds` และ message ต่อท้ายด้วยชื่อ rule | ชี้ rule ที่ผิดจาก `ruleIndexes` ได้ |
| `PUT/DELETE /api/devices/:deviceId/cameras/:cameraId`, `/printers/:printerId` (ใหม่) | ต้อง PUT `cameraIds`/`printerIds` ทั้งชุด | ผูก/ถอดทีละตัว ไม่มี body ดู [11](#11-devices-apidevices) | หน้า mapping เปลี่ยนมาใช้เส้นนี้ได้ |
| `POST/PUT /api/devices` กล้องซ้ำ gate | กล้องตัวเดียวผูกได้หลาย gate | กล้อง 1 ตัวต่อ 1 Barrier Gate ชนได้ `409 CAMERA_IN_USE` + `{ cameraIds, assignedTo }` ต้องเอาออกจาก gate เดิมก่อน | ย้ายกล้อง = PUT gate เดิมเอาออก แล้ว PUT gate ใหม่ |
| `POST/PUT /api/devices` | `allowedIps` error field `allowedIps`, `deviceName` เป็นช่องว่างได้, `cameraIds`/`printerIds` ใส่ id อะไรก็ได้ | field `allowedIps.<index>`, `deviceName` ตัดช่องว่างแล้วห้ามว่าง (PUT ส่ง `null`/`""` ไม่ได้), `cameraIds` ต้องเป็นกล้องที่ลงทะเบียน `printerIds` ต้องเป็น printer ไม่งั้น `400 INVALID_DEVICE_MAPPING` + `{ field, invalidIds }` | map error ตาม field |

---

## การเปลี่ยนแปลงรอบที่ 3 (2026-10-06): โลโก้, logoUrl และ payment WebSocket

path ไม่เปลี่ยน เปลี่ยน validation และวิธีปิด WebSocket ของ Admin

| เรื่อง | เดิม | ใหม่ | frontend ต้องแก้ |
|---|---|---|---|
| `POST /api/theme/logo` | ตรวจแค่นามสกุลและ mimetype ที่ client ส่ง | ตรวจเนื้อไฟล์ (magic bytes) ด้วย ต้องเป็นชนิดเดียวกับนามสกุล ไม่ผ่านจะลบไฟล์ทิ้งและไม่เปลี่ยนโลโก้ | ไม่ต้อง (ยังเป็น `400 INVALID_LOGO_FILE` มี message ใหม่ ดู [12](#12-theme-apitheme)) |
| `PUT /api/theme` `logoUrl` | รับ string อะไรก็ได้ | รับแค่ `null` หรือ `/uploads/<ชื่อไฟล์>` ค่าอื่นได้ `400 VALIDATION_ERROR` (`field: 'logoUrl'`) | ไม่ต้อง ถ้าไม่ส่ง `logoUrl` |
| `WS /api/payments/ws` handshake ไม่ผ่าน | HTTP 401/403 (browser เห็นแค่ close 1006) | upgrade สำเร็จแล้วปิดด้วย close code `4401` / `4403` พร้อม reason | แยกการ reconnect ตาม close code ดู [18](#18-realtime-payment-websocket) |
| `WS /api/payments/ws` ระหว่างเชื่อมต่อ | ไม่ถูกตัดแม้ logout หรือ session หมดอายุ | ปิดด้วย `4401` เมื่อ session จบ และ `4403` เมื่อถูกถอดสิทธิ์ `transactions` (access token หมดอายุอย่างเดียวไม่ปิด) | เหมือนข้อบน |

`WS /api/client/payments/ws` ไม่เปลี่ยน

---

## การเปลี่ยนแปลง Route รอบที่ 2 (2026-10-05): ตัด v1 และตั้งชื่อใหม่

ย้ายมาใช้ path ใหม่ทั้งหมดในรอบเดียว path เดิมใช้ไม่ได้แล้ว (ตอบ `404 ROUTE_NOT_FOUND` เมื่อส่ง Bearer token ที่ถูกต้อง ถ้าไม่ส่ง token จะได้ `401 UNAUTHORIZED` ก่อน เพราะ path ที่ไม่ใช่ public ต้องผ่าน auth) **body, query (ยกเว้น `chargeId` ของ QR) และ response ไม่เปลี่ยน** เปลี่ยนแค่ path

**1. ตัด `/v1` ออกจากทุก path** รวม WebSocket เช่น `/api/v1/transactions` เป็น `/api/transactions`, `wss://<host>/api/v1/client/payment/ws` เป็น `wss://<host>/api/client/payments/ws` (ถ้า frontend ตั้ง base URL เป็น `https://<host>/api/v1` ให้เปลี่ยนเป็น `https://<host>/api`)

**2. เส้นที่เปลี่ยนชื่อ** (เส้นอื่นที่ไม่อยู่ในตาราง เปลี่ยนแค่ตัด `/v1`)

| กลุ่ม | Path เดิม | Path ใหม่ |
|---|---|---|
| Client | `GET /api/v1/devices/config` | `GET /api/client/config` |
| Client | `POST /api/v1/client/check-in` | `POST /api/client/heartbeat` |
| Client | `GET /api/v1/client/transaction?plateNo=` | `GET /api/client/transactions?plateNo=` |
| Client | `GET /api/v1/client/transaction/:id` | `GET /api/client/transactions/:id` |
| Client | `GET /api/v1/client/payment-methods` | `GET /api/client/payments/methods` |
| Client | `POST /api/v1/client/payment/edc` | `POST /api/client/payments/edc` |
| Client | `POST /api/v1/client/payment/omise/charge` | `POST /api/client/payments/charges` |
| Client | `GET /api/v1/client/payment/omise/qr?chargeId=<id>` | `GET /api/client/payments/charges/<id>/qr` (chargeId ย้ายมาอยู่ใน path) |
| Client | `POST /api/v1/client/payment` (Dev Test) | `POST /api/client/payments/test` |
| Client | `WS /api/v1/client/payment/ws` | `WS /api/client/payments/ws` |
| Admin | `GET /api/v1/admin/payment/methods` | `GET /api/payments/methods` |
| Admin | `GET /api/v1/admin/payment/edc-terminals` | `GET /api/payments/edc/terminals` |
| Admin | `GET /api/v1/admin/payment/edc/reconciliation` | `GET /api/payments/edc/reconciliation` |
| Admin | `POST /api/v1/admin/payment/omise/charge` | `POST /api/payments/charges` |
| Admin | `GET /api/v1/admin/payment/omise/qr?chargeId=<id>` | `GET /api/payments/charges/<id>/qr` (`?documentPath=` ยังใช้ได้) |
| Admin | `POST /api/v1/admin/payment/omise/charges/:chargeId/verify` | `POST /api/payments/charges/:chargeId/verify` |
| Admin | `GET /api/v1/admin/payment/omise/refunds` | `GET /api/payments/refunds` |
| Admin | `GET /api/v1/admin/payment/omise/refunds/events` | `GET /api/payments/refunds/events` |
| Admin | `POST /api/v1/admin/payment/omise/refunds/:chargeId/resolve` | `POST /api/payments/refunds/:chargeId/resolve` |
| Admin | `WS /api/v1/admin/payment/ws` | `WS /api/payments/ws` |
| Admin | `GET /api/v1/overview/summary` | `GET /api/overview` |
| Admin | `GET /api/v1/service-pricing/config` | `GET /api/pricing` |
| Admin | `PUT /api/v1/service-pricing/config` | `PUT /api/pricing` |
| Admin | `POST /api/v1/devices/:deviceId/reissue-activation-code` | `POST /api/devices/:deviceId/activation-code` |
| Admin | `POST /api/v1/theme/upload-logo` | `POST /api/theme/logo` (field `logo` เหมือนเดิม) |
| Omise | `POST /api/v1/payment-gateway/omise/webhook` | `POST /api/payment-gateway/omise/webhook` (ต้องแก้ URL webhook ใน Omise dashboard ด้วย) |

**3. ชื่อที่ไม่เปลี่ยน (ตัดแค่ `/v1`)**: `/api/auth/*`, `/api/dashboard`, `/api/transactions`, `/api/members`, `/api/payment-settings`, `/api/devices` (ยกเว้นเส้น activation code), `GET/PUT /api/theme`, `DELETE /api/theme/logo`, `/api/system-settings`, `POST /api/client/activate`, `GET /api/client/events`, `POST /api/payment-gateway/omise/simulate-paid` ส่วน `/health`, `/docs` ไม่เปลี่ยน และ `qrData` (`/payment?tx=<id>`) เป็น path ของหน้า frontend ไม่ได้เปลี่ยน

ตัวอย่าง:

```ts
// เดิม
fetch(`${API}/api/v1/client/payment/omise/qr?chargeId=${chargeId}`);
fetch(`${API}/api/v1/admin/payment/omise/charge`, { method: 'POST', body });
new WebSocket(`${WS}/api/v1/admin/payment/ws?chargeId=${chargeId}&token=${token}`);
// ใหม่
fetch(`${API}/api/client/payments/charges/${chargeId}/qr`);
fetch(`${API}/api/payments/charges`, { method: 'POST', body });
new WebSocket(`${WS}/api/payments/ws?chargeId=${chargeId}&token=${token}`);
```

---

## การเปลี่ยนแปลง Route รอบที่ 1 (2026-10-05)

รวม route ที่ทำงานซ้ำกันและลบ route ที่ไม่มี flow ไหนใช้แล้ว ลดจาก 80 เหลือ 65 เส้น route เดิมในตารางนี้ใช้ไม่ได้แล้ว (`404 ROUTE_NOT_FOUND`, หรือ `401` เมื่อไม่ส่ง token) ให้ frontend เปลี่ยนไปใช้ route ใหม่ตามตาราง (คอลัมน์ "ใช้แทนด้วย" เป็นชื่อล่าสุดหลัง[รอบที่ 2](#การเปลี่ยนแปลง-route-รอบที่-2-2026-10-05-ตัด-v1-และตั้งชื่อใหม่)แล้ว)

| Route เดิม (ลบแล้ว) | ใช้แทนด้วย | สิ่งที่ frontend ต้องแก้ |
|---|---|---|
| `PATCH /transactions/:plateNo/status` | `PATCH /transactions/:plateNo` | body เหมือนเดิม `{ status }` แต่ response เป็น `{ message, transaction }` อ่านสถานะจาก `transaction.status` |
| `GET /members/stats` | `GET /members` | response เปลี่ยนจาก `Member[]` เป็น `{ data: Member[]; meta }` สถิติอยู่ใน `meta` |
| `PATCH /members/:id/permissions` | `PATCH /members/:id` | ส่ง `{ permissions: [...] }` response เป็น `Member` (ไม่มี `{ message, member }` ครอบแล้ว) |
| `POST /service-pricing/config` | `PUT /pricing` | เพิ่ม rule = ใส่ rule ใหม่ (ไม่มี `id`) ลงใน `pricingRules` แล้วส่งทั้งชุด |
| `PATCH /service-pricing/config/:id` | `PUT /pricing` | แก้ rule ใน array (คง `id` เดิม) แล้วส่งทั้งชุด |
| `DELETE /service-pricing/config/:id` | `PUT /pricing` | เอา rule ออกจาก array แล้วส่งทั้งชุด |
| `POST /devices/cameras/provision` | `POST /devices` + `deviceType: 'camera'` | response เหมือนเดิม (`deviceToken` แสดงครั้งเดียว) |
| `POST /devices/printers/provision` | `POST /devices` + `deviceType: 'printer'` | response เหมือนเดิม |
| `POST /devices/edc` | `POST /devices` + `deviceType: 'edc'` | response เหมือนเดิม |
| `GET /system-settings/receipt` | `GET /system-settings` | อ่านจาก `.receipt` |
| `PUT /system-settings/receipt` | `PUT /system-settings` | ครอบ body ด้วย `{ receipt: {...} }` |
| `PUT /system-settings/receipt/printer` | `PUT /system-settings` | ส่ง `{ receipt: { printer: {...} } }` response เป็น `SuccessMessageResponse` |
| `POST /client/:plateNo/payment` (Dev Test) | `POST /client/payments/test` | ย้ายทะเบียนไปไว้ใน body `{ plateNo }` |
| `POST /admin/payment/omise/refunds/:chargeId/refund-card` | `POST /payments/refunds/:chargeId/resolve` | ไม่มี flow ไหนสร้าง Omise card charge แล้ว (บัตรใช้ EDC) ให้คืนเงินเองแล้วกด resolve |
| `GET /payment-gateway/omise/config` | (ไม่มี) | backend สร้าง PromptPay source เอง frontend ไม่ต้องใช้ Omise.js และ public key |

Response ที่เปลี่ยนโดยไม่ได้ย้าย route:
- `RefundItem.canRefundToCard` ถูกลบ (เดิมเป็น `false` เสมอ) และ `refundMethod` มีแค่ `'manual' | null`
- Omise webhook ไม่ตอบ `action: 'refund_confirmed'` แล้ว event `refund.create` ตอบ `ignored`
- error `REFUND_IN_PROGRESS`, `CARD_REFUND_NOT_SUPPORTED`, `CARD_REFUND_UNCONFIRMED`, `PRICING_RULE_NOT_FOUND` ไม่มีแล้ว
- `PUT /pricing` ต้องมี `price` ทุก rule, ตอบ `configUpdatedAt` ใหม่กลับมา และตอบ `409 PRICING_CONFIG_CONFLICT` เมื่อ `configUpdatedAt` ที่ส่งมาเก่ากว่าค่าที่บันทึกล่าสุด (ดู [9](#9-pricing-apipricing))

ตัวอย่าง request ใหม่:

```http
PATCH /api/transactions/3งจ9012
{ "status": "cancelled" }

PATCH /api/members/m_123
{ "permissions": ["dashboard", "transactions"] }

POST /api/devices
{ "deviceType": "camera", "deviceName": "LPR Camera Exit 1", "deviceCode": "CAM-OUT-A", "gateId": "GATE-A", "direction": "OUT" }

PUT /api/system-settings
{ "receipt": { "printer": { "fontSize": 12, "paperWidth": 80 } } }

POST /api/client/payments/test
{ "plateNo": "3งจ9019", "method": "wallet" }
```

---

## 1. Common Types

```ts
type DateTimeString = string;   // ISO 8601 UTC เช่น "2026-10-01T03:00:00.000Z"
type DateString = string;       // "YYYY-MM-DD" (วันตามเวลาไทย)
type Baht = number;             // เงินบาท ทศนิยมไม่เกิน 2 ตำแหน่ง
type Satang = number;           // เงินสตางค์ (integer) 4000 = 40.00 บาท

type Permission = 'dashboard' | 'overview' | 'transactions' | 'pricing' | 'devices' | 'theme' | 'settings';
type VehicleType = 'car' | 'motorcycle';
type Direction = 'IN' | 'OUT';
type TransactionStatus = 'pending' | 'partially_paid' | 'paid_waiting_exit' | 'completed' | 'cancelled';
type PaymentChannelCode = 'cashier' | 'kiosk' | 'gate' | 'mobile';
type PaymentMethodId = 'cash' | 'qr' | 'promptpay' | 'card' | 'mobile_banking' | 'bank1' | 'wallet' | 'other' | string;
type DeviceType = 'kiosk' | 'barrier_gate' | 'camera' | 'printer' | 'edc';
type DeviceStatus = 'pending_activation' | 'active' | 'offline' | 'maintenance' | 'inactive' | string;

// รูปแบบ error ของทุกเส้น (details เพิ่มเติมจะอยู่ระดับเดียวกับ message/code)
// error ที่ไม่ใช่ของ API (เช่น JSON body พัง) ได้ code BAD_REQUEST, body JSON เกิน 1mb ได้ HTTP 413 code BAD_REQUEST
// 413 จาก reverse proxy (ก่อนถึง backend) อาจไม่ใช่ JSON
interface ApiErrorResponse {
  message: string;
  code: string;                                   // UPPER_SNAKE_CASE ใช้เขียน logic
  errors?: { field: string | null; message: string }[]; // มีเมื่อ code = VALIDATION_ERROR
  [detail: string]: unknown;
}

interface SuccessMessageResponse {
  success: true;
  message: string;
}

interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
```

### 1.1 Transaction

```ts
interface FeeRange {
  feeType: 'base_hour' | 'next_hour' | null;
  ruleId: string | null;
  hourStart: number;       // ชั่วโมงที่เริ่มของวันนั้น (1-24)
  hourEnd: number;
  hours: number;
  pricePerHour: Baht;
  amount: Baht;
}

interface FeeBreakdown {
  days: { date: DateString; hours: number; amount: Baht; ranges: FeeRange[] }[];
  overnight: { ruleId: string | null; nights: number; pricePerNight: Baht; amount: Baht } | null;
}

interface PaymentRecord {
  id: string;
  method: PaymentMethodId;
  channel: PaymentChannelCode;
  source: 'kiosk' | 'barrier_gate' | 'mobile' | 'admin';
  sourceContext: Record<string, unknown>;
  paidAmount: Baht;
  paidAt: DateTimeString;
  expiryAt: DateTimeString;        // เวลาออกจากลานหลังจ่าย (exit window)
  processedBy: string;             // user id ของ Admin / "kiosk_<deviceId>" / "mobile_user" / "omise_<chargeId>"
  reference?: string;              // เลขอนุมัติ EDC
  terminalId?: string;             // TID ของเครื่อง EDC
  edcDeviceId?: string;            // deviceId ของเครื่อง EDC
  deviceId?: string;
  deviceType?: string;
  deviceName?: string;
  deviceLocation?: string;
}

// รายการจอดแบบเต็ม (ค่าจอดคำนวณ ณ ตอนที่เรียก)
interface Transaction {
  id: string;
  billNo: string;
  plateNo: string;
  vehicleType: VehicleType;
  entryAt: DateTimeString | null;
  exitAt: DateTimeString | null;
  calculatedAt: DateTimeString;     // เวลาที่ใช้คำนวณค่าจอด
  exitTimeLimit: DateTimeString | null;
  isOverstay: boolean;              // จ่ายแล้วแต่เลย exitTimeLimit
  status: TransactionStatus;
  baseAmount: Baht;
  netAmount: Baht;                  // ค่าจอดทั้งหมด (รายการที่รถออกแล้วใช้ค่าที่บันทึกตอนปิด)
  totalPaid: Baht;
  remainingAmount: Baht;            // ยอดที่ต้องจ่าย ใช้ค่านี้เสมอ ห้ามคำนวณเอง
  serviceDisplay: string;           // "DD-MM-YYYY | H : M"
  durationHour: number;             // ชั่วโมงที่คิดเงินจริง
  totalMinutes: number;
  feeBreakdown: FeeBreakdown;
  payments: PaymentRecord[];
  qrData: string;                   // "<frontendUrl>/payment?tx=<id>"
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

// รายการในตาราง Admin
interface TransactionListItem {
  id: string;
  billNo: string;
  plateNo: string;
  vehicleType: VehicleType;
  status: TransactionStatus;
  entryAt: DateTimeString | null;
  exitAt: DateTimeString | null;
  exitTimeLimit: DateTimeString | null;
  isOverstay: boolean;
  amount: { net: Baht; paid: Baht; remaining: Baht };
  duration: { display: string; hours: number; totalMinutes: number };
  latestPayment: {
    paymentId: string;
    method: PaymentMethodId;
    channel: PaymentChannelCode;
    paidAmount: Baht;
    paidAt: DateTimeString;
    reference: string | null;
  } | null;
  updatedAt: DateTimeString;
}

interface PlateCandidate {
  plateNo: string;
  billNo: string;
  vehicleType: VehicleType;
  status: TransactionStatus;
  entryAt: DateTimeString | null;
  exitAt: DateTimeString | null;
  exitTimeLimit: DateTimeString | null;
}

// ผลค้นหาด้วยทะเบียนที่ตรงหลายคัน (ให้เลือกแล้วค้นใหม่ด้วยทะเบียนเต็ม)
interface PlateLookupMultiple {
  matchType: 'multiple';
  requiresSelection: true;
  query: string;
  candidates: PlateCandidate[];
}
```

### 1.2 Device

```ts
// อุปกรณ์ในรายการของ Admin (ไม่มี deviceTokenHash)
interface Device {
  id: string;
  deviceId: string | null;            // null ระหว่าง pending_activation
  deviceCode: string;
  deviceName: string;
  deviceType: DeviceType;
  connectionType: string;             // 'lan' | 'usb' | 'wifi' | ...
  ipAddress: string | null;
  location: string | null;
  status: DeviceStatus;
  isOnline: boolean;                  // EDC เป็น false เสมอ
  note: string;
  lastSeen?: DateTimeString | null;
  activatedAt?: DateTimeString;
  deviceTokenIssuedAt?: DateTimeString | null;
  activationCode?: string | null;     // เฉพาะ kiosk/barrier_gate ที่รอ activate
  activationExpiresAt?: DateTimeString | null;
  allowedIps?: string[];              // ว่าง = ไม่จำกัด IP
  // kiosk / barrier_gate
  gateId?: string | null;
  direction?: Direction | null;
  cameraIds?: string[];
  printerIds?: string[];
  edcDeviceId?: string | null;        // เครื่อง EDC ที่ผูก
  cameraRole?: string | null;
  printerRole?: string | null;
  // edc
  terminalId?: string;
  merchantId?: string | null;
  provider?: string | null;
  serialNo?: string | null;
  usage?: 'cashier' | 'device';
}

// response หลังสร้าง/แก้ไขอุปกรณ์
interface DeviceMutationResponse {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  connectionType: string;
  location: string | null;
  ipAddress: string | null;
  gateId: string | null;
  direction: Direction | null;
  cameraIds: string[];
  cameraRole: string | null;
  printerIds: string[];
  printerRole: string | null;
  edcDeviceId: string | null;
  terminalId: string | null;
  merchantId: string | null;
  provider: string | null;
  serialNo: string | null;
  usage: 'cashier' | 'device' | null;
  allowedIps: string[];
  status: DeviceStatus;
  isOnline: boolean;
  note: string;
}
```

### 1.3 Omise Charge และ Refund

```ts
interface OmiseChargeResponse {
  provider: 'omise';
  reused: boolean;                  // true = ได้ QR เดิมที่ยังไม่หมดอายุ
  chargeId: string;
  status: 'pending' | 'successful' | 'failed' | 'expired' | 'reversed' | string;
  amount: Satang;
  currency: string;                 // "thb"
  plateNo: string;
  method: PaymentMethodId;
  channel: PaymentChannelCode;
  authorizeUri: string | null;
  expiresAt: DateTimeString | null;
  transaction: { plateNo: string; status: TransactionStatus; remainingAmount: Baht; exitTimeLimit: DateTimeString | null };
  qr: Record<string, unknown> | null; // scannable_code ของ Omise (แนะนำให้ใช้รูปจาก endpoint QR แทน)
}

type RefundReason = 'already_paid' | 'transaction_not_payable' | 'transaction_not_found' | 'overpaid';

interface GatewayCharge {
  id: string;
  provider: 'omise';
  chargeId: string;
  transactionId: string;
  plateNo: string;
  amount: Satang;
  currency: string;
  method: PaymentMethodId;
  channel: PaymentChannelCode;
  status: string;
  paidAt: DateTimeString | null;
  processedAt: DateTimeString | null;
  raw?: Record<string, unknown> | null;  // มีเฉพาะใน REST ของ Admin ไม่มีใน realtime event
  refundAmount: Satang | null;
  refundReason: RefundReason | null;
  refundResolvedAt: DateTimeString | null;
  refundNote: string | null;
  refundResolvedBy: string | null;        // user id
  refundMethod: 'manual' | null;         // manual = พนักงานคืนเงินเองแล้วกด resolve
  refundId: string | null;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

interface RefundItem {
  chargeId: string;
  transactionId: string;
  plateNo: string;
  method: PaymentMethodId;
  channel: PaymentChannelCode;
  amount: Satang;
  refundAmount: Satang;
  refundReason: RefundReason;
  paidAt: DateTimeString | null;
  refundMethod: 'manual' | null;
}
```

### 1.4 Payment Method ที่ใช้ได้

```ts
interface AvailablePaymentMethod {
  id: PaymentMethodId;
  label: string;
  icon: string | null;
}
```

---

## 2. Authentication

| ประเภท | วิธีส่ง | ใช้กับ |
|---|---|---|
| Admin (cookie) | browser ส่ง cookie `__Host-cp_access` เอง (`fetch(..., { credentials: 'include' })`) จาก origin ใน `ADMIN_ORIGINS` | Admin Frontend |
| Admin (Bearer) | `Authorization: Bearer <accessToken>` | Postman, script, BFF เดิมช่วงเปลี่ยนผ่าน |
| Device | `x-device-id: <deviceId>` + `x-device-token: <deviceToken>` (หรือ `Authorization: Device <deviceToken>` คู่กับ `x-device-id`) | Kiosk, Barrier Gate, Camera, Printer |
| Public | ไม่ต้องส่ง | ระบุ "Public" |

### 2.1 โหมด cookie (Admin Frontend)
- backend เลือกโหมดจาก header `Origin`: อยู่ใน `ADMIN_ORIGINS` = โหมด cookie, ไม่มี `Origin` = โหมด Bearer (token ใน body)
- มี `Authorization: Bearer` จะใช้ Bearer ก่อน ถ้าไม่มีจึงอ่าน cookie
- cookie ที่ backend ตั้ง (JavaScript อ่านไม่ได้):

| cookie | ค่า | attribute | อายุ |
|---|---|---|---|
| `__Host-cp_access` | access token | `HttpOnly; Secure; SameSite=Strict; Path=/` ไม่มี Domain | `rememberMe=false`: session cookie (หายเมื่อปิด browser) / `true`: `Max-Age=expiresIn` |
| `__Secure-cp_refresh` | refresh token | `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` ไม่มี Domain | `rememberMe=false`: session cookie / `true`: `Max-Age=refreshExpiresIn` |

  - ไม่มี Domain จึงผูกกับ host ของ API เท่านั้น ไม่ส่งไป Admin หรือ Kiosk
  - refresh cookie ถูกส่งไปแค่ `/api/auth/*`
  - dev บน http ตั้ง `AUTH_COOKIE_INSECURE=true` แล้วชื่อจะเป็น `cp_access` / `cp_refresh` ไม่มี Secure (production ห้ามตั้ง API ไม่ยอม start)
  - ลบ cookie ด้วยชื่อและ path เดิม + `Max-Age=0`
- backend ยังบังคับ access token 1 ชม., idle 1 ชม., สูงสุด 12 ชม. เหมือนโหมด Bearer
- CSRF: request ที่ใช้ cookie
  - `Origin` ต้องอยู่ใน `ADMIN_ORIGINS` (ไม่มี `Origin` หรือ origin อื่น เช่น Kiosk) → `403 CSRF_REJECTED`
  - method ที่ไม่ใช่ GET/HEAD/OPTIONS และมี body ต้องเป็น `application/json` (ยกเว้น `POST /api/theme/logo` เป็น `multipart/form-data`) → ไม่งั้น `415 UNSUPPORTED_MEDIA_TYPE`
  - `POST /api/auth/login|refresh|logout` ที่มี `Origin` นอก `ADMIN_ORIGINS` → `403 CSRF_REJECTED`

### 2.2 CORS
| Origin | path | ผล |
|---|---|---|
| ใน `ADMIN_ORIGINS` | ทุกเส้น | `Access-Control-Allow-Origin: <origin ตรงตัว>`, `Access-Control-Allow-Credentials: true`, `Vary: Origin` |
| ใน `CLIENT_ORIGINS` (Kiosk/Barrier Gate/Mobile) | `/api/client/*` | `Access-Control-Allow-Origin: <origin>` ไม่มี credentials |
| ใน `CLIENT_ORIGINS` | เส้นอื่น | ไม่มี CORS header |
| ไม่มี `Origin` (server, อุปกรณ์, `<img>`) | ทุกเส้น | ไม่มี CORS header และไม่ถูกปฏิเสธ |
| อื่น ๆ | ทุกเส้น | `403 CORS_NOT_ALLOWED` ไม่มี CORS header |

- Preflight `OPTIONS` ตอบ `204` โดยไม่ต้อง auth
- `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE`
- `Access-Control-Allow-Headers` ของ Admin: `Content-Type,Last-Event-ID`
- `Access-Control-Max-Age: 600`
- `Access-Control-Expose-Headers: Retry-After,RateLimit,RateLimit-Policy,Content-Disposition`
- error response (400-500) มี CORS header เหมือน response ปกติ frontend จึงอ่าน `code` ได้

### 2.3 กติกาอื่น
- เส้น Admin ส่วนใหญ่ต้องมี permission ของกลุ่มนั้น ถ้าไม่มีได้ `403 FORBIDDEN` body เป็น `{ message: 'Forbidden', code: 'FORBIDDEN' }` เท่านั้น (ไม่บอก permission ที่ต้องใช้ ให้ frontend หาจาก route ของตัวเอง)
- token หมดอายุหรือ session ถูก revoke ได้ `401` (`UNAUTHORIZED` = ไม่มี token/cookie, `INVALID_TOKEN` = token ผิดหรือหมดอายุ, `INVALID_SESSION` = session จบแล้ว) ไม่มี code `TOKEN_EXPIRED` แยก ให้ refresh 1 ครั้งเมื่อได้ 401 แล้วลองใหม่
- Device: ถ้าส่ง `deviceId` หลายที่ (header, query, body) ค่าต้องตรงกัน ไม่งั้นได้ `400 DEVICE_IDENTITY_MISMATCH`
- Device ที่ Admin ตั้ง `allowedIps` ใช้ token ได้เฉพาะจาก IP เหล่านั้น (`403 INVALID_DEVICE_CREDENTIALS`, `reason: "ip_not_allowed"`)
- Rate limit:
  - `POST /auth/login`: login ที่ผิด 10 ครั้งต่อ 15 นาทีต่อ IP+username
  - `POST /client/activate`: 20 ครั้งต่อ 15 นาทีต่อ IP
  - client lookup/payment ที่ไม่มี device credentials: 120 ครั้งต่อนาทีต่อ IP
  - เกินกำหนด → `429 TOO_MANY_REQUESTS` (login → `TOO_MANY_LOGIN_ATTEMPTS`)

---

## 3. Auth (`/api/auth`)

```ts
interface AuthUser {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;                     // 'super_admin' | 'staff' | ...
  permissions: Permission[];
  status: 'active' | string;
  phone?: string | null;
  createdAt?: DateTimeString;
  updatedAt?: DateTimeString;
}

// โหมด cookie (Origin อยู่ใน ADMIN_ORIGINS): token อยู่ใน cookie ไม่อยู่ใน body
interface CookieSessionResponse {
  user: AuthUser;
  expiresIn: number;                // วินาทีจน access token หมดอายุ (สูงสุด 3600)
  refreshExpiresIn: number;         // วินาทีจนหมด idle timeout
  sessionExpiresAt: DateTimeString; // 12 ชม. หลัง login ต่ออายุไม่ได้
}

// โหมด Bearer (ไม่มี Origin)
interface AuthTokensResponse extends CookieSessionResponse {
  token: string;                    // access token
  refreshToken: string;             // ใช้ได้ครั้งเดียว
}
```

### POST `/api/auth/login`
- Auth: Public (rate limit)
- Body:
  ```ts
  { username: string; password: string; rememberMe?: boolean }   // rememberMe ใช้เฉพาะโหมด cookie (default false)
  ```
- 200: โหมด cookie = `CookieSessionResponse` + ตั้ง cookie ทั้งสองตัว / โหมด Bearer = `AuthTokensResponse`
- Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 CSRF_REJECTED` (Origin นอก `ADMIN_ORIGINS`), `429 TOO_MANY_LOGIN_ATTEMPTS`
- `rememberMe` ถูกจำไว้ใน session และใช้ตั้งอายุ cookie ทุกครั้งที่ refresh

### POST `/api/auth/refresh`
- Auth: Public
- Body: โหมด cookie ไม่มี body (อ่าน `__Secure-cp_refresh`) / โหมด Bearer `{ refreshToken: string }`
- 200: โหมด cookie = `CookieSessionResponse` + ตั้ง cookie ใหม่ทั้งคู่ (คง `rememberMe` เดิม) / โหมด Bearer = `AuthTokensResponse` (ได้ refreshToken ใหม่ทุกครั้ง)
- Errors: `401 INVALID_REFRESH_TOKEN`, `401 SESSION_EXPIRED`, `403 CSRF_REJECTED`
- โหมด cookie:
  - ไม่มี refresh cookie → `401 SESSION_EXPIRED` + ลบ cookie
  - ส่ง refresh token เดิมซ้ำภายใน 30 วินาทีหลัง rotate (อีกแท็บเพิ่ง refresh) → `401 INVALID_REFRESH_TOKEN` แต่**ไม่ลบ** cookie
  - token reuse หลัง 30 วินาที (session ถูก revoke), session หมดอายุหรือถูก revoke → `401` + ลบ cookie
- ควรใช้ in-flight refresh เดียวร่วมกันทุก request/แท็บ

### POST `/api/auth/logout`
- Auth: ไม่บังคับ token ที่ยังไม่หมดอายุ ระบุ session จาก access token (Bearer หรือ cookie) ถ้าใช้ไม่ได้ใช้ refresh token (cookie หรือ body `{ refreshToken }` ในโหมด Bearer)
- revoke session, ส่ง `session_revoked` reason `logout` ให้ SSE และปิด payment WebSocket ด้วย `4401 'logout'`
- 200: `{ message: string }` เสมอ แม้ไม่มี token หรือ session จบไปแล้ว (โหมด cookie ลบ cookie ทั้งคู่ทุกครั้ง)
- Errors: `403 CSRF_REJECTED` (Origin นอก `ADMIN_ORIGINS`)

### GET `/api/auth/me`
- Auth: Admin (Bearer หรือ cookie)
- 200: `{ user: AuthUser }`

---

## 4. Dashboard (`/api/dashboard`)

Auth: Admin + permission `dashboard`

### GET `/api/dashboard`
- 200:
  ```ts
  interface DashboardSummary {
    summaryCards: { totalTickets: number; paidCount: number; pendingCount: number; paidRevenue: Baht };
    revenueGroups: { id: 'staff' | 'scan'; amount: Baht; percent: number }[];
    channelBreakdown: {
      id: 'ch_cashier' | 'ch_kiosk' | 'ch_mobile' | 'ch_gate';
      code: PaymentChannelCode;
      icon: string;
      name: string;
      label: string;
      subLabel: string;
      allowedMethods: PaymentMethodId[];
      amount: Baht;
      count: number;
      percent: number;
    }[];
    pendingRefunds: { count: number; amount: Baht };  // บาท (แปลงจากสตางค์แล้ว)
    isRealtime: true;
  }
  ```
- กติกา:
  - จำนวนบัตรนับตามวันที่เข้า (วันนี้ตามเวลาไทย)
  - รายได้นับตาม `paidAt` วันนี้
  - `staff` = เงินสดของ cashier, `scan` = method `promptpay` / `qr` / `qr_code` ทุกช่องทาง
  - `revenueGroups` ไม่มี `label` (frontend ตั้งชื่อเอง) และ `percent` คิดจากรายได้รวม บัตร EDC และ method อื่นไม่อยู่ทั้งสองกลุ่ม `staff` + `scan` จึงรวมกันไม่ถึง 100 ได้

### GET `/api/dashboard/events`
- SSE ดู [17.2](#172-admin-streams)

---

## 5. Overview (`/api/overview`)

Auth: Admin + permission `overview`

### GET `/api/overview`
- Query:
  ```ts
  {
    start_date?: string;  // "YYYY-MM-DD" หรือ date-time (ไม่มี timezone = เวลาไทย) หรือใช้ startDate
    end_date?: string;    // หรือ endDate
  }
  ```
  - ไม่ส่งเลย = ต้นเดือนนี้ถึงตอนนี้
- 200:
  ```ts
  type UsageChartItem =
    | { label: string; date: DateString; value: number }                              // daily (≤ 7 วัน)
    | { label: string; startDate: DateString; endDate: DateString; value: number }    // weekly (≤ 31 วัน)
    | { label: string; month: string; value: number }                                 // monthly "YYYY-MM" (≤ 12 เดือน)
    | { label: string; year: number; value: number };                                 // yearly

  interface OverviewSummary {
    filters: { startDate: DateTimeString; endDate: DateTimeString };
    chartFilters: { startDate: DateTimeString; endDate: DateTimeString }; // เท่ากับ filters เสมอ
    summaryCards: { totalTickets: number; paidCount: number; pendingCount: number; paidRevenue: Baht; avgWait: null };
    revenueGroups: { id: 'staff' | 'scan'; label: string; amount: Baht; percent: number }[];
    usageChartMode: 'daily' | 'weekly' | 'monthly' | 'yearly';
    usageChartLabel: string;
    usageChart: UsageChartItem[];
    serviceSummary: { id: 'cashier' | 'epayment' | 'kiosk' | 'gate'; label: string; amount: Baht; count: number; percent: number; icon: string }[];
    totalSummaryCalculated: Baht;
  }
  ```
- Errors: `400 INVALID_DATE_RANGE` (วันที่ไม่มีจริง หรือ start > end)

### GET `/api/overview/events`
- SSE ใช้ query เดียวกับ summary ดู [17.2](#172-admin-streams)

---

## 6. Transactions (`/api/transactions`)

Auth: Admin + permission `transactions` (ยกเว้น `POST /` ที่กล้องเรียกด้วย device token ได้)

### GET `/api/transactions`
- Query:
  ```ts
  {
    keyword?: string;
    plate_no?: string;
    bill_no?: string;
    page?: number;      // default 1
    per_page?: number;  // default 10, สูงสุด 100
    all?: 'true' | '1' | 'false' | '0';
  }
  ```
- 200:
  ```ts
  {
    data: TransactionListItem[];
    meta: (PaginationMeta | { all: true; total: number; totalFound: number }) & { realtime: true };
  }
  ```

### GET `/api/transactions/events`
- SSE ใช้ query เดียวกับ list ดู [17.2](#172-admin-streams)

### GET `/api/transactions/:plateNo`
- Params: `plateNo: string` (ทะเบียนเต็มหรือบางส่วน อย่างน้อย 4 ตัวอักษร) รวมรายการที่ปิดแล้ว
- Query: `{ exact?: 'true' | '1' }`
- `exact=true`: หาเฉพาะทะเบียนที่ตรงทุกตัวอักษร (หลังตัดช่องว่าง/ขีด, ตัวใหญ่) ได้ `Transaction` ล่าสุดของทะเบียนนั้น ไม่เจอ = `404 TRANSACTION_NOT_FOUND` เสมอ และไม่คืน `PlateLookupMultiple` ใช้ก่อนรับเงิน
- 200: `Transaction | PlateLookupMultiple` (`exact=true` ได้ `Transaction` เท่านั้น)
- วิธีค้นเมื่อไม่ส่ง `exact`:
  1. หาทะเบียนที่ตรงทุกตัวอักษรก่อน ถ้าเจอได้ `Transaction` ล่าสุดของทะเบียนนั้น (ไม่ได้ `PlateLookupMultiple`)
  2. ไม่เจอ ค้นทะเบียนที่ "มีคำนี้อยู่" ถ้าเจอหลายทะเบียนได้ `PlateLookupMultiple` ถ้าเจอทะเบียนเดียวได้ `Transaction` ของทะเบียนนั้น ซึ่ง**อาจไม่ตรงกับที่ค้น** เช่นค้น `กข1234` ได้ `1กข1234`
  - ถ้าต้องการทะเบียนตรงตัว ให้ส่ง `exact=true`
- Errors: `400 INVALID_PLATE_NO`, `404 TRANSACTION_NOT_FOUND`

### POST `/api/transactions/:plateNo/payment`
รับชำระที่เคาน์เตอร์ (เงินสด / บัตรผ่านเครื่อง EDC / ช่องทางอื่นที่ไม่ผ่าน gateway)
- Params: `plateNo: string` (**ทะเบียนเต็ม** ตรงทั้งหมด)
- Body:
  ```ts
  {
    method?: PaymentMethodId;        // default 'cash' ต้องอยู่ใน GET /payments/methods
    channel?: 'cashier' | null;      // ค่าอื่นได้ 400 ADMIN_CHANNEL_MUST_BE_CASHIER
    amount?: number | string;        // บาท > 0 ไม่ส่ง = จ่ายยอดค้างทั้งหมด (จ่ายบางส่วนได้)
    reference?: string | null;       // บังคับเมื่อ method = 'card' (เลขอนุมัติ EDC สูงสุด 100 ตัว)
    edcDeviceId?: string | null;     // บังคับเมื่อ method = 'card' (จาก GET /payments/edc/terminals)
    confirmPendingCharge?: boolean;  // true = รับเงินต่อแม้มี QR PromptPay ที่ยังสแกนได้
    deviceId?: string | null;        // อุปกรณ์ของเคาน์เตอร์ (ไม่บังคับ)
    deviceName?: string | null;
    deviceLocation?: string | null;
  }
  ```
- 200:
  ```ts
  {
    message: string;
    data: {
      transaction: { transactionId: string; billNo: string; plateNo: string; vehicleType: VehicleType; status: TransactionStatus };
      payment: {
        paymentId: string;
        method: PaymentMethodId;
        channel: 'cashier';
        paidAmount: Baht;
        paidAt: DateTimeString;
        processedBy: string;
        reference: string | null;
        terminalId: string | null;
        edcDeviceId: string | null;
      } | null;
      amount: { netAmount: Baht; paidAmount: Baht; remainingAmount: Baht };
      parking: { entryAt: DateTimeString | null; exitTimeLimit: DateTimeString | null; isOverstay: boolean; durationDisplay: string; totalMinutes: number };
    };
  }
  ```
- Errors:
  - `400`: `ADMIN_CHANNEL_MUST_BE_CASHIER`, `INVALID_AMOUNT`, `AMOUNT_EXCEEDS_REMAINING` (มี `remainingAmount`), `NO_REMAINING_AMOUNT`, `PAYMENT_SELECTION_INVALID`, `PAYMENT_REFERENCE_REQUIRED`, `EDC_DEVICE_REQUIRED`, `EDC_DEVICE_NOT_FOUND`, `EDC_DEVICE_NOT_CASHIER`, `VALIDATION_ERROR`
  - `404 TRANSACTION_NOT_FOUND`
  - `409 PENDING_GATEWAY_CHARGE` → details `{ chargeId: string; method: string; channel: string; amount: Satang; expiresAt: DateTimeString }` ให้ถามยืนยันแล้วส่งใหม่พร้อม `confirmPendingCharge: true`
  - `409 EDC_DEVICE_UNAVAILABLE`, `409 PAYMENT_REFERENCE_USED`
- ส่ง `reference` + `edcDeviceId` เดิมซ้ำกับรายการเดิม (retry) จะได้ผลสำเร็จเดิมโดยไม่บันทึกซ้ำ

### PATCH `/api/transactions/:plateNo`
- Params: `plateNo: string` (ทะเบียนเต็ม)
- Body (field ที่ไม่รู้จักจะถูกตัดทิ้ง):
  ```ts
  {
    plateNo?: string;
    vehicleType?: VehicleType;
    serviceType?: string;
    status?: TransactionStatus;
    totalPaid?: number | string;       // บาท ≥ 0 ทศนิยมไม่เกิน 2
    payments?: ({ paidAmount: number | string; paidAt: string } & Record<string, unknown>)[];
    exitTimeLimit?: string | null;     // date-time (ไม่มี timezone = เวลาไทย)
    exitAt?: string | null;
  }
  ```
- 200: `{ message: string; transaction: Transaction }`
- Errors:
  - `400 VALIDATION_ERROR`
  - `404 TRANSACTION_NOT_FOUND`
  - `409 INVALID_STATUS_TRANSITION` (รายการ completed/cancelled เปลี่ยนสถานะไม่ได้)
  - `409 ACTIVE_TRANSACTION_EXISTS` (เปลี่ยนเป็นทะเบียนที่มีรายการเปิดอยู่)
- ตั้ง `status: 'completed'` แล้ว backend เติม `exitAt` เป็นเวลาปัจจุบันถ้าไม่ได้ส่ง และบันทึกค่าจอดตอนปิดไว้
- เปลี่ยนสถานะอย่างเดียวก็ใช้เส้นนี้ เช่น `{ "status": "cancelled" }` แล้วอ่านสถานะใหม่จาก `transaction.status` (เส้น `/status` ถูกลบแล้ว)

### DELETE `/api/transactions/:plateNo`
- Params: `plateNo: string` (ทะเบียนเต็ม)
- 200: `{ message: string }`
- Errors: `404 TRANSACTION_NOT_FOUND`, `409 TRANSACTION_HAS_PAYMENTS` (มีการชำระแล้ว ให้เปลี่ยนสถานะเป็น `cancelled` แทน)

### POST `/api/transactions` (event จากกล้อง LPR)
- Auth: device token ของกล้อง (`x-device-id` + `x-device-token`) หรือ Admin + `transactions`
- Body:
  ```ts
  {
    plateNo: string;
    cameraId: string;          // ต้องตรงกับ deviceId ของกล้องที่ยืนยันตัวตน
    direction: 'IN' | 'OUT';   // ไม่สนตัวพิมพ์
    gateId?: string | null;    // ไม่ส่ง = ใช้ gateId ของ Barrier Gate ที่ผูกกล้องนี้
    vehicleType?: VehicleType;
    capturedAt?: string;       // date-time (ไม่มี timezone = เวลาไทย, เร็วกว่า server เกิน 5 นาทีจะใช้เวลา server)
    imageUrl?: string;
  }
  ```
- 200 / 201:
  ```ts
  interface GateResponse {
    success: boolean;          // ประมวลผลได้ไม่ error (ไม่ใช่การตัดสินเปิดไม้กั้น)
    openGate: boolean;         // true เฉพาะ action = OPEN_GATE
    action: 'OPEN_GATE' | 'PAYMENT_REQUIRED' | 'TRANSACTION_NOT_FOUND' | 'IGNORE_DUPLICATE' | 'IGNORE_ACTIVE_TRANSACTION';
    message: string;           // ข้อความภาษาไทยสำหรับแสดงหน้าจอ
    data: {
      transactionId: string | null;
      plateNo: string;
      direction: Direction;
      status: TransactionStatus | 'not_found';
      openGate: boolean;
      exitTimeLimit?: DateTimeString | null;
      capturedAt?: DateTimeString;
      checkedAt?: DateTimeString;
      paymentRequired?: boolean;
      reason?: 'pending' | 'partially_paid' | 'remaining_amount' | string | null;
      remainingAmount?: Baht | null;
      netAmount?: Baht | null;
      totalPaid?: Baht | null;
    };
  }
  ```
  (201 = สร้างหรือปิดรายการแล้ว, 200 = ไม่เปลี่ยนข้อมูล)
- Errors (มี `success: false, action` ใน details):
  - `400 VALIDATION_ERROR`
  - `400 CAMERA_ID_MISMATCH`
  - `400/403 CAMERA_GATE_VALIDATION_ERROR` (มี `reason`)

---

## 7. Payments (`/api/payments`)

Auth: Admin + permission `transactions` ทุกเส้น

### GET `/api/payments/methods`
- 200:
  ```ts
  { channel: 'cashier'; methods: AvailablePaymentMethod[] }
  ```
  - มีเฉพาะ method ที่เปิดใช้งานและอนุญาตใน `ch_cashier`
  - `card` มีเฉพาะเมื่อมีเครื่อง EDC ของเคาน์เตอร์ที่ active

### GET `/api/payments/edc/terminals`
- 200:
  ```ts
  { data: { deviceId: string; deviceName: string; terminalId: string; location: string | null; provider: string | null }[] }
  ```
  (เครื่อง EDC `usage: 'cashier'` ที่ active)

### POST `/api/payments/charges`
สร้าง QR PromptPay ที่เคาน์เตอร์
- Body:
  ```ts
  {
    transactionId?: string;       // แนะนำ (หรือส่ง plateNo เต็ม)
    plateNo?: string;
    method?: 'promptpay';         // ส่ง method promptpay โดยไม่ต้องมี source (backend สร้าง QR เอง)
    sourceType?: string;
    source?: string;              // ไม่บังคับสำหรับ promptpay
    amount?: Satang;              // ถ้าส่งต้องเท่ากับยอดค้าง
    channel?: 'cashier';
    returnUri?: string;           // http/https
  }
  ```
- 201: `{ message: 'created'; charge: OmiseChargeResponse }`
- Errors:
  - `400`: `ADMIN_CARD_NOT_SUPPORTED` (ห้ามส่ง card token), `SOURCE_REQUIRED`, `PAYMENT_METHOD_REQUIRED`, `ADMIN_CHANNEL_MUST_BE_CASHIER`, `INVALID_AMOUNT`, `AMOUNT_MISMATCH`, `NO_REMAINING_AMOUNT`, `AMOUNT_BELOW_GATEWAY_MINIMUM` (ดูด้านล่าง), `PAYMENT_SELECTION_INVALID`, `TRANSACTION_NOT_PAYABLE`, `INVALID_RETURN_URI`, `INVALID_PLATE_NO` (เมื่อส่ง `plateNo`), `TRANSACTION_ID_OR_PLATE_NO_REQUIRED`
  - `404 TRANSACTION_NOT_FOUND`
  - `409 MULTIPLE_PLATE_MATCHES` (มี `candidates`)
  - `500 OMISE_NOT_CONFIGURED` (backend ยังไม่ตั้ง `OMISE_SECRET_KEY`)
  - `504 OMISE_TIMEOUT`
  - Omise error (code ของ Omise, มี `provider: 'omise'` และ `location`)
- ไม่ส่ง `channel` = `cashier`, ไม่ส่ง `amount` = ยอดค้างตอนสร้าง QR (`charge.amount` = `charge.transaction.remainingAmount` × 100)
- ขั้นต่ำของ Omise (PromptPay 20.00 บาท ตาม https://docs.omise.co/promptpay) ตรวจก่อนเรียก Omise ทั้ง Admin และ Client charge:
  ```ts
  interface AmountBelowGatewayMinimumError {   // HTTP 400
    code: 'AMOUNT_BELOW_GATEWAY_MINIMUM';
    message: string;                           // "promptpay requires at least 20 THB per payment"
    minimumAmount: Baht;                       // 20
    remainingAmount: Baht;                     // ยอดค้างตอนนั้น
  }
  ```

### GET `/api/payments/charges/:chargeId/qr`
- Params: `chargeId: string`
- Query (ไม่บังคับ): `{ documentPath?: string }` (ส่งแล้วจะดาวน์โหลดเอกสาร Omise ตาม path นั้นแทน)
- 200: รูปภาพ (`image/png` / `image/svg+xml` …) ใช้เป็น `src` ได้ผ่าน blob
- Errors: `400 QR_ONLY_FOR_PROMPTPAY`, `400 NOT_OMISE_CHARGE`, `400 INVALID_OMISE_DOCUMENT_PATH` (`documentPath` ไม่ใช่ของ Omise), `404 GATEWAY_CHARGE_NOT_FOUND`, `502 OMISE_QR_DOCUMENT_NOT_FOUND`, `502 OMISE_DOCUMENT_UNAVAILABLE`, `504 OMISE_TIMEOUT`

### POST `/api/payments/charges/:chargeId/verify`
ตรวจสถานะ charge กับ Omise เมื่อพนักงานกด "ตรวจสอบการชำระเงิน" (สำรองเมื่อ webhook ไม่มา ห้ามเรียกเป็นรอบ)
- Auth: Admin + `transactions`
- Params: `chargeId: string` (ใช้ได้กับ charge ทุกช่องทาง ไม่ใช่เฉพาะของ Admin)
- Body: ไม่มี
- ผลลัพธ์:
  - จ่ายแล้ว: backend บันทึกการชำระครั้งเดียว (ทางเดียวกับ webhook) และส่ง `payment_updated` ทาง payment WebSocket ให้ใช้ผลจาก WebSocket ได้เลย
  - `failed` / `expired` / `reversed`: บันทึกสถานะและส่ง `payment_updated`
  - ยังรอจ่าย: คืน `action: 'pending'` และไม่ส่ง event
- 200:
  ```ts
  {
    message: 'Charge verified';
    action: 'processed' | 'refund_required' | 'already_processed' | 'pending' | 'updated';
    chargeId: string;
    status: 'successful' | 'pending' | 'failed' | 'expired' | 'reversed';
    refundAmount?: Satang;                // เมื่อเงินเข้าแต่ต้องคืน (refund_required / จ่ายเกิน)
    refundReason?: RefundReason;
    transaction?: Transaction;            // เมื่อ action = 'processed'
  }
  ```
- Errors: `400 NOT_OMISE_CHARGE`, `404 GATEWAY_CHARGE_NOT_FOUND`, `429 CHARGE_VERIFY_TOO_FREQUENT` (มี header `Retry-After`), `504 OMISE_TIMEOUT`, Omise error (code ของ Omise)
- Rate limit: 1 ครั้งต่อ charge ทุก 10 วินาที (นับต่อ charge ไม่ใช่ต่อผู้ใช้) frontend ปิดปุ่ม 10 วินาทีหลังกด

### POST `/api/payments/ws-ticket`
ขอ ticket สำหรับต่อ Admin payment WebSocket จาก browser (ไม่ต้องใส่ access token ใน URL)
- Body: `{ chargeId: string }` (ไม่เกิน 100 ตัว)
- 200: `{ ticket: string; expiresIn: 30 }` (วินาที)
- Errors: `400 VALIDATION_ERROR` (`field: 'chargeId'`), `401` (token/session), `403 FORBIDDEN`, `404 GATEWAY_CHARGE_NOT_FOUND`, `429 TOO_MANY_REQUESTS` (มี `Retry-After`)
- ticket ใช้ได้ครั้งเดียว ผูกกับ user + session + `chargeId` และหมดอายุใน 30 วินาที ต้องขอใหม่ทุกครั้งที่ต่อหรือต่อใหม่
- เก็บใน memory ของ API ถ้า API restart ticket ที่ยังไม่ใช้จะหายหมด (ต่อแล้วได้ `4401 invalid_token` ให้ขอใหม่)
- Rate limit: 30 ครั้งต่อ user ต่อนาที
- ใช้ต่อ `wss://<host>/api/payments/ws?chargeId=<id>&ticket=<ticket>` ดู [18](#18-realtime-payment-websocket)

### GET `/api/payments/refunds`
- Query:
  ```ts
  { status?: 'pending' | 'resolved' }   // default pending
  ```
- 200:
  ```ts
  { data: GatewayCharge[]; summary: { pendingCount: number; pendingAmount: Satang } }
  ```

### GET `/api/payments/refunds/events`
- SSE รายการรอคืนเงิน ดู [17.3](#173-refund-stream)

### POST `/api/payments/refunds/:chargeId/resolve`
บันทึกว่าพนักงานคืนเงินเองแล้ว
- Params: `chargeId: string`
- Body:
  ```ts
  { note?: string | null }
  ```
- 200: `{ message: 'Refund resolved'; charge: GatewayCharge }`
- Errors: `400 REFUND_NOT_REQUIRED`, `404 GATEWAY_CHARGE_NOT_FOUND`, `409 REFUND_ALREADY_RESOLVED`
- เป็นวิธีเดียวที่ใช้ปิดรายการรอคืนเงิน (PromptPay คืนผ่าน Omise ไม่ได้ ส่วนบัตรคืนที่เครื่อง EDC)

### GET `/api/payments/edc/reconciliation`
- Query:
  ```ts
  {
    date?: DateString;        // วันเดียว (default วันนี้)
    start_date?: DateString;  // ช่วงวันที่ไม่เกิน 31 วัน
    end_date?: DateString;
  }
  ```
- 200:
  ```ts
  interface EdcReconciliation {
    range: { startDate: DateTimeString; endDate: DateTimeString };
    total: { count: number; amount: Baht };
    missingReferenceCount: number;
    terminals: {
      terminalId: string | null;
      edcDevice: { deviceId: string; deviceName: string; location: string | null; provider: string | null; usage: 'cashier' | 'device' } | null;
      channels: PaymentChannelCode[];
      deviceIds: string[];
      count: number;
      amount: Baht;
      payments: {
        transactionId: string;
        plateNo: string;
        billNo: string;
        paymentId: string;
        reference: string | null;
        terminalId: string | null;
        edcDeviceId: string | null;
        amount: Baht;
        paidAt: DateTimeString;
        channel: PaymentChannelCode;
        deviceId: string | null;
        processedBy: string | null;
      }[];
    }[];
  }
  ```
- Errors: `400 INVALID_DATE_RANGE`

---

## 8. Members (`/api/members`)

Auth: Admin + permission `settings`

```ts
interface Member {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  role: string;
  status: string;
  permissions: Permission[];
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

interface MemberBody {
  username?: string;
  password?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  status?: string;
  permissions?: Permission[];
}
```

### GET `/api/members`
- Query: `{ keyword?: string; status?: string; role?: string }`
- 200:
  ```ts
  {
    data: Member[];
    meta: {
      total: number;          // จำนวนหลัง filter keyword/status/role
      totalMembers: number;   // สถิติด้านล่างนับจาก member ทั้งหมด ไม่สน filter (ใช้แสดงการ์ดสรุป)
      activeMembers: number;
      totalAdmins: number;    // จำนวน super_admin
    };
  }
  ```
- หน้า Members เรียกเส้นนี้เส้นเดียวได้ทั้งตารางและการ์ดสถิติ (`/members/stats` ถูกลบแล้ว)

### POST `/api/members`
- Body: `MemberBody`
  - ต้องมี `username` หรือ `email`
  - ต้องมี `password`
  - ต้องมี `name` หรือ `firstName`/`lastName`
- 201: `Member`
- Errors:
  - `400`: `USERNAME_REQUIRED`, `PASSWORD_REQUIRED`, `NAME_REQUIRED`, `VALIDATION_ERROR`
  - `403 PERMISSION_NOT_GRANTABLE` (มี `permissions`), `403 SUPER_ADMIN_REQUIRED`
  - `409 USERNAME_TAKEN`

### PATCH `/api/members/:id`
- Body: `MemberBody` (ส่งเฉพาะที่แก้)
- 200: `Member`
- Errors:
  - `403 PERMISSION_NOT_GRANTABLE`, `403 SUPER_ADMIN_REQUIRED`
  - `404 MEMBER_NOT_FOUND`
  - `409`: `CANNOT_DISABLE_SELF`, `LAST_SUPER_ADMIN`, `USERNAME_TAKEN`
- เปลี่ยน password แล้ว session อื่นของ user นั้นถูก logout
- แก้สิทธิ์อย่างเดียวส่ง `{ "permissions": ["dashboard", "transactions"] }` (เส้น `/permissions` ถูกลบแล้ว)

### DELETE `/api/members/:id`
- 200: `{ message: string }`
- Errors: `403 SUPER_ADMIN_REQUIRED`, `404 MEMBER_NOT_FOUND`, `409 CANNOT_DELETE_SELF`, `409 LAST_SUPER_ADMIN`

---

## 9. Pricing (`/api/pricing`)

Auth: Admin + permission `pricing`

```ts
interface PricingRule {
  id: string;
  name: string;
  feeType: 'base_hour' | 'next_hour' | 'overnight_day';
  vehicleType: VehicleType;
  price: Baht;                    // ทศนิยมไม่เกิน 2
  status: 'active' | string;      // ไม่ใช่ active = ไม่ใช้คำนวณ
  hourStart?: number | null;      // base_hour = 1 เสมอ, next_hour = 1-24
  hourEnd?: number | null;        // 1-24 (next_hour null = ถึงชั่วโมงที่ 24)
  baseHours?: number;             // base_hour เท่ากับ hourEnd (เก็บไว้ให้ frontend เดิม)
}

interface PricingRuleBody {
  id?: string;                    // ไม่ส่ง = rule ใหม่ (backend สร้าง pr_...) ส่ง id เดิม = แก้ rule นั้น
  name?: string | null;
  feeType?: 'base_hour' | 'next_hour' | 'overnight_day';
  vehicleType?: VehicleType;
  price: number | string;         // บังคับทุก rule
  baseHours?: number | string;
  hourStart?: number | string;
  hourEnd?: number | string | null;
  status?: string;
}
```

### GET `/api/pricing`
- 200: `{ pricingRules: PricingRule[]; configUpdatedAt: DateTimeString | null }`

### PUT `/api/pricing`
เส้นเดียวที่ใช้เพิ่ม แก้ และลบ rule โดยส่ง `pricingRules` ทั้งชุดที่ต้องการให้เป็น (rule ที่ไม่อยู่ใน array จะถูกลบ)
- Body:
  ```ts
  {
    configUpdatedAt?: DateTimeString | null;   // ค่าจาก GET หรือจาก PUT ครั้งก่อน
    pricingRules?: PricingRuleBody[];          // ไม่ส่ง = คง rule เดิม
    paymentChannels?: unknown[];
    serviceChannelMapping?: unknown[];
    masterData?: Record<string, unknown>;
  }
  ```
- 200: `{ success: true; message: 'Pricing config updated'; configUpdatedAt: DateTimeString | null }`
- Errors:
  - `400 VALIDATION_ERROR`: `errors[].field` เป็น `pricingRules.<index>.<field>` เช่น `pricingRules.0.price`
  - `400 INVALID_PRICING_RULES`: กติกาข้าม rule (เช่นช่วงชั่วโมงซ้อนกัน) ไม่มี `errors[]` แต่บอก rule ที่ผิด:
    ```ts
    interface InvalidPricingRulesError {
      code: 'INVALID_PRICING_RULES';
      message: string;                 // เช่น "car next_hour ranges must not overlap (rules: Car next, Car extra)"
      vehicleType: VehicleType;
      ruleIndexes: number[];           // index ใน pricingRules ที่ส่งมาใน PUT
      ruleIds: (string | null)[];      // id ที่ส่งมา (null = rule ใหม่ที่ไม่ได้ส่ง id) ลำดับเดียวกับ ruleIndexes
    }
    ```
  - `409 PRICING_CONFIG_CONFLICT` + `{ configUpdatedAt: DateTimeString | null }` ล่าสุด (null เฉพาะเมื่อยังไม่เคยบันทึก): มีคนบันทึกไปก่อน ให้โหลด GET ใหม่ แจ้งผู้ใช้ แล้วค่อยส่งอีกครั้ง
- backend เทียบ `configUpdatedAt` แบบ string ตรงตัว ให้ส่งค่าที่ได้จาก GET/PUT กลับไปตามเดิม ห้าม format ใหม่
- ขั้นตอนที่แนะนำ:
  1. `GET /config` แล้วเก็บ `pricingRules` กับ `configUpdatedAt`
  2. เพิ่ม/แก้/ลบในหน้าจอ แล้ว `PUT` array ทั้งชุดพร้อม `configUpdatedAt`
  3. เก็บ `configUpdatedAt` ใหม่จาก response ไว้ใช้กับ PUT ครั้งถัดไป (ไม่ส่ง `configUpdatedAt` = ไม่ตรวจการชน เหมือนพฤติกรรมเดิม)
- ตัวอย่าง (ลบ rule `overnight_day` และเพิ่ม `next_hour`):
  ```json
  {
    "configUpdatedAt": "2026-10-05T03:00:00.000Z",
    "pricingRules": [
      { "id": "pr_base_car", "name": "Car first 3 hours", "feeType": "base_hour", "vehicleType": "car", "hourEnd": 3, "price": 30, "status": "active" },
      { "name": "Car next hours", "feeType": "next_hour", "vehicleType": "car", "hourStart": 4, "hourEnd": 24, "price": 20, "status": "active" }
    ]
  }
  ```

กติกาที่ backend ตรวจ (`INVALID_PRICING_RULES`), นับต่อประเภทรถที่ active:
- `base_hour` ได้ 1 rule และ `overnight_day` ได้ 1 rule
- `next_hour` ต้องเริ่มหลัง `base_hour` และห้ามซ้อนกัน
- ถ้า `base_hour` ครอบถึงชั่วโมง 24 แล้ว ห้ามมี `next_hour`

---

## 10. Payment Settings (`/api/payment-settings`)

Auth: Admin + permission `pricing`

```ts
interface PaymentMethodSetting {
  id: PaymentMethodId;      // เปลี่ยนไม่ได้
  label: string;
  icon: string | null;
  isActive: boolean;
}

interface PaymentChannelSetting {
  id: 'ch_cashier' | 'ch_kiosk' | 'ch_mobile' | 'ch_gate' | string;
  code: PaymentChannelCode | string;   // id ที่ตัด "ch_" (ค่าที่ใช้เป็น channel)
  name: string;
  icon: string;
  allowedMethods: PaymentMethodId[];
}
```

### GET `/api/payment-settings/methods`
- 200: `{ data: PaymentMethodSetting[]; configUpdatedAt: DateTimeString | null }`

### PATCH `/api/payment-settings/methods/:id`
- Body: `{ label?: string; icon?: string | null; isActive?: boolean }`
- 200: `SuccessMessageResponse`
- Errors: `400 VALIDATION_ERROR`, `404 PAYMENT_METHOD_NOT_FOUND`

### DELETE `/api/payment-settings/methods/:id`
- 200: `SuccessMessageResponse`
- Errors: `404 PAYMENT_METHOD_NOT_FOUND`, `409 PAYMENT_METHOD_PROTECTED` (method หลักลบไม่ได้ ให้ใช้ `isActive: false`)

### GET `/api/payment-settings/channels`
- 200: `{ data: PaymentChannelSetting[]; configUpdatedAt: DateTimeString | null }`

### PATCH `/api/payment-settings/channels/:id`
- Body: `{ allowedMethods: PaymentMethodId[] }`
- 200: `SuccessMessageResponse`
- Errors: `400 VALIDATION_ERROR`, `404 PAYMENT_CHANNEL_NOT_FOUND` (channel ไม่มี หรือ method ไม่มีจริง)

### DELETE `/api/payment-settings/channels/:id`
- 200: `SuccessMessageResponse`
- Errors: `404 PAYMENT_CHANNEL_NOT_FOUND`, `409 PAYMENT_CHANNEL_PROTECTED` (channel หลักลบไม่ได้)

การแก้ทุกครั้งส่ง event `payment_settings_updated` ไปที่ client SSE และ Admin refund stream

---

## 11. Devices (`/api/devices`)

Auth: Admin + permission `devices`

### GET `/api/devices`
- Query: `{ deviceType?: DeviceType; status?: DeviceStatus; keyword?: string }`
- 200:
  ```ts
  { total: number; online: number; offline: number; maintenance: number; devices: Device[]; configUpdatedAt: DateTimeString | null }
  ```

### GET `/api/devices/events`
- SSE ดู [17.2](#172-admin-streams)

### POST `/api/devices` (สร้างอุปกรณ์ทุกประเภท)
เส้นเดียวสำหรับสร้างอุปกรณ์ทุกประเภท `deviceType` เป็นตัวเลือกว่าจะสร้างอะไรและได้ response แบบไหน

| `deviceType` | สิ่งที่ได้ | Response 201 |
|---|---|---|
| `kiosk`, `barrier_gate` | อุปกรณ์รอ activate + activation code | `ActivationCodeResponse` |
| `camera`, `printer` | อุปกรณ์ active + `deviceToken` (แสดงครั้งเดียว) | `CredentialedDeviceResponse` |
| `edc` | เครื่อง EDC (ไม่มี token) | `EdcDeviceResponse` |

ถ้าไม่ส่ง `deviceType` หรือส่งค่าอื่น จะได้ `400 VALIDATION_ERROR` (`deviceType must be one of kiosk, barrier_gate, camera, printer, edc`)

กติกาที่ใช้ทั้ง POST และ PUT:
- `deviceName` (หรือ `name`) ตัดช่องว่างหัวท้ายแล้วห้ามว่าง → `400 VALIDATION_ERROR` field `deviceName` (PUT ไม่ส่งได้ แต่ส่ง `null` หรือ `""` ไม่ได้)
- `allowedIps` ต้องเป็น IPv4/IPv6 → `400 VALIDATION_ERROR` field `allowedIps.<index>`
- `cameraIds` ต้องเป็น deviceId ของกล้องที่ลงทะเบียน และ `printerIds` ต้องเป็นของ printer (ไม่ต้อง online) ตรวจเฉพาะ field ที่ส่งมา:
  ```ts
  interface InvalidDeviceMappingError {   // HTTP 400
    code: 'INVALID_DEVICE_MAPPING';
    message: string;
    status: 'error';
    field: 'cameraIds' | 'printerIds';    // field แรกที่ผิด (ตรวจ cameraIds ก่อน)
    invalidIds: string[];
  }
  ```
- กล้อง 1 ตัวผูกได้กับ Barrier Gate เดียว ถ้ากล้องอยู่กับ gate อื่นแล้วจะบันทึกไม่ได้ ต้องเอาออกจาก gate เดิมก่อน (backend ไม่ย้ายให้อัตโนมัติ) บันทึก gate เดิมด้วยกล้องเดิมซ้ำได้:
  ```ts
  interface CameraInUseError {   // HTTP 409
    code: 'CAMERA_IN_USE';
    message: string;
    status: 'error';
    field: 'cameraIds';
    cameraIds: string[];                                   // กล้องที่ชน
    assignedTo: { cameraId: string; deviceId: string }[];  // gate ที่ผูกกล้องนั้นอยู่
  }
  ```
- printer ใช้ร่วมหลายเครื่องได้ (ไม่มีกฎนี้)
- ไม่บังคับ: `location`, `gateId`/`direction`/`cameraIds` ของ barrier_gate และ `printerIds` อย่างน้อย 1 (ผูกทีหลังได้ กล้องถูกตรวจตอนส่ง event)

**kiosk / barrier_gate**
- Body:
  ```ts
  {
    deviceType: 'kiosk' | 'barrier_gate';
    deviceName: string;            // หรือ name
    deviceCode?: string | null;
    location?: string | null;
    gateId?: string | null;        // barrier_gate
    direction?: 'IN' | 'OUT' | '' | null;
    cameraIds?: string[];          // barrier_gate
    printerIds?: string[];
    edcDeviceId?: string | null;   // EDC usage 'device' ที่ยังว่าง
    allowedIps?: string[];         // IP address เท่านั้น
    connectionType?: string | null;
    note?: string | null;
  }
  ```
- 201:
  ```ts
  interface ActivationCodeResponse { CodeActivate: string; deviceName: string; deviceType: 'kiosk' | 'barrier_gate'; status: 'active'; isOnline: true }
  ```
  (`CodeActivate` = activation code 6 หลัก อายุ 10 นาที)
- Errors:
  - `400`: `VALIDATION_ERROR`, `EDC_DEVICE_NOT_FOUND`, `EDC_USAGE_INVALID`
  - `409 DEVICE_CODE_EXISTS`, `409 EDC_DEVICE_IN_USE`
  - (error ของ Devices มี `status: 'error'` ใน details)

**camera / printer**
- Body:
  ```ts
  {
    deviceType: 'camera' | 'printer';
    deviceName: string;          // หรือ name
    deviceCode?: string | null;  // ใช้เป็น deviceId
    location?: string | null;
    gateId?: string | null;
    direction?: 'IN' | 'OUT' | '' | null;
    ipAddress?: string | null;
    cameraRole?: string | null;
    printerRole?: string | null;
    allowedIps?: string[];
    connectionType?: string | null;
    note?: string | null;
  }
  ```
- 201:
  ```ts
  interface CredentialedDeviceResponse { success: true; message: 'Camera provisioned' | 'Printer provisioned'; device: DeviceMutationResponse; deviceToken: string }
  ```
  (`deviceToken` แสดงครั้งเดียว)
- Errors: `400 VALIDATION_ERROR`, `409 DEVICE_CODE_EXISTS`

**edc**
- Body:
  ```ts
  {
    deviceType: 'edc';
    deviceName: string;
    terminalId: string;              // TID บนสลิป ห้ามซ้ำ สูงสุด 50 ตัว
    merchantId?: string | null;
    provider?: string | null;
    serialNo?: string | null;
    location?: string | null;
    usage?: 'cashier' | 'device';    // default 'device'
    note?: string | null;
  }
  ```
- 201:
  ```ts
  interface EdcDeviceResponse { success: true; message: 'EDC device registered'; device: DeviceMutationResponse }   // ไม่มี deviceToken
  ```
- แยก response ฝั่ง frontend ได้ด้วย `'CodeActivate' in res` (kiosk/barrier) หรือ `'deviceToken' in res` (camera/printer)
- Errors: `400 VALIDATION_ERROR`, `400 EDC_TERMINAL_ID_REQUIRED`, `409 EDC_TERMINAL_ID_EXISTS`, `409 DEVICE_CODE_EXISTS`

### POST `/api/devices/:deviceId/activation-code`
- 201:
  ```ts
  {
    success: true;
    message: string;
    deviceId: string;
    deviceName: string;
    deviceType: 'kiosk' | 'barrier_gate';
    activationCode: string;
    expiresAt: DateTimeString;
    device: DeviceMutationResponse;
  }
  ```
- Errors: `400 DEVICE_TYPE_NOT_ACTIVATABLE`, `403 DEVICE_MAINTENANCE`, `404 DEVICE_NOT_FOUND`
- token เดิมใช้ไม่ได้ทันที และ SSE ของเครื่องนั้นจะได้ `device_revoked`

### PUT `/api/devices/:deviceId`
- Body (ส่งเฉพาะที่แก้, mapping ส่ง array ทั้งชุด):
  ```ts
  {
    deviceName?: string | null;
    deviceCode?: string | null;
    location?: string | null;
    connectionType?: string | null;
    ipAddress?: string | null;
    status?: string;                 // เช่น 'active' | 'maintenance'
    isOnline?: boolean;
    note?: string | null;
    allowedIps?: string[];
    // kiosk / barrier_gate
    gateId?: string | null;
    direction?: 'IN' | 'OUT' | '' | null;
    cameraIds?: string[];
    printerIds?: string[];
    edcDeviceId?: string | null;     // null = ยกเลิกการผูก
    cameraRole?: string | null;
    printerRole?: string | null;
    // edc
    terminalId?: string;
    merchantId?: string | null;
    provider?: string | null;
    serialNo?: string | null;
    usage?: 'cashier' | 'device';
    deviceType?: DeviceType;         // ต้องเท่าเดิม เปลี่ยนไม่ได้
  }
  ```
- 200: `{ message: 'Device updated'; device: DeviceMutationResponse }`
- Errors:
  - `400`: `VALIDATION_ERROR`, `DEVICE_TYPE_IMMUTABLE`, `EDC_DEVICE_NOT_FOUND`, `EDC_USAGE_INVALID`, `EDC_OWNER_INVALID`, `EDC_TERMINAL_ID_REQUIRED`, `INVALID_DEVICE_MAPPING`
  - `404 DEVICE_NOT_FOUND`
  - `409 EDC_DEVICE_IN_USE`, `409 EDC_TERMINAL_ID_EXISTS`, `409 CAMERA_IN_USE`

### PUT / DELETE `/api/devices/:deviceId/cameras/:cameraId` และ `/api/devices/:deviceId/printers/:printerId`
ผูก (PUT) หรือถอด (DELETE) กล้อง/printer ทีละตัว โดยไม่ต้องส่ง `cameraIds`/`printerIds` ทั้งชุด (แนะนำให้หน้าจัดการ mapping ใช้เส้นนี้)
- ไม่มี body
- 200: `{ message: 'Device mapped' | 'Device unmapped'; device: DeviceMutationResponse }` (`device` มี `cameraIds`/`printerIds` ล่าสุด)
- กล้องผูกได้กับ `barrier_gate` เท่านั้น printer ผูกได้กับ `kiosk` และ `barrier_gate`
- ผูกตัวที่ผูกอยู่แล้ว หรือถอดตัวที่ไม่ได้ผูก ได้ 200 ผลเดิม (เรียกซ้ำได้)
- ถอดไม่ตรวจว่ากล้อง/printer ยังมีอยู่ จึงใช้ล้าง id เก่าที่ค้างได้
- backend คำนวณรายการใหม่ใน lock ของ config admin 2 คนผูกคนละตัวพร้อมกันจึงไม่ทับกัน
- Errors:
  - `400 DEVICE_MAPPING_NOT_SUPPORTED`: ผูกกล้องกับ kiosk หรือผูกกับอุปกรณ์ประเภทอื่น
  - `400 INVALID_DEVICE_MAPPING`: id ไม่ใช่กล้อง/printer ที่ลงทะเบียน (`field`, `invalidIds`)
  - `404 DEVICE_NOT_FOUND`: ไม่พบ kiosk/gate
  - `409 CAMERA_IN_USE`: กล้องผูกกับ gate อื่นอยู่ (`assignedTo`) ต้อง DELETE จาก gate เดิมก่อน
- ตัวอย่างย้ายกล้อง `CAM-1` จาก GATE-A ไป GATE-B:
  ```http
  DELETE /api/devices/GATE-A/cameras/CAM-1
  PUT    /api/devices/GATE-B/cameras/CAM-1
  ```
- `PUT /api/devices/:deviceId` แบบส่ง array ทั้งชุดยังใช้ได้ตามเดิม (ใช้กฎเดียวกัน)

### DELETE `/api/devices/:deviceId`
- 200: `{ success: true; message: 'Device deleted' }`
- Errors: `404 DEVICE_NOT_FOUND`
- id ที่ลบจะถูกเอาออกจาก `cameraIds`/`printerIds`/`edcDeviceId` ของอุปกรณ์อื่นด้วย

---

## 12. Theme (`/api/theme`)

Auth: Admin + permission `theme`

```ts
interface Theme {
  themeColor: string | null;
  logoUrl: string | null;            // "/uploads/logo-....png" path ต่อจาก backend origin (เปิดแบบ public ได้ ไม่ต้องใช้ token)
  themeMode: string;                 // เช่น "theme1" | "custom" | ""
  customThemeColor: string | null;
  updatedAt?: DateTimeString;
  configUpdatedAt: DateTimeString | null;
}
```

### GET `/api/theme`
- 200: `Theme`

### PUT `/api/theme`
- Body: `{ themeColor?: string | null; logoUrl?: string | null; themeMode?: string; customThemeColor?: string | null }`
  - `logoUrl` รับแค่ `null` หรือ `/uploads/<ชื่อไฟล์>` ค่าอื่น (URL ภายนอก, `../`, `""`) ได้ `400 VALIDATION_ERROR` (`field: 'logoUrl'`)
  - ไม่ส่ง `logoUrl` = คงโลโก้เดิม แนะนำให้อัปโหลด/ลบโลโก้ผ่าน `/api/theme/logo` เท่านั้น
- 200: `{ message: 'Theme updated'; theme: Theme }`

### POST `/api/theme/logo`
- Body: `multipart/form-data` field `logo` (jpg/jpeg/png/webp ไม่เกิน 2 MB)
- backend ตรวจนามสกุล, mimetype และเนื้อไฟล์ (magic bytes ต้องเป็นชนิดเดียวกับนามสกุล) frontend ไม่ต้องตรวจซ้ำ ไฟล์ที่ไม่ผ่านถูกลบทิ้งและโลโก้เดิมไม่เปลี่ยน
- 200: `{ message: string; logoUrl: string; theme: Theme }`
- Errors (HTTP 400 ทั้งหมด):
  - `LOGO_FILE_REQUIRED`: ไม่ได้แนบไฟล์
  - `INVALID_LOGO_FILE` แยกด้วย `message`:
    - `Only images (jpg, png, webp) are allowed!` (นามสกุล/mimetype ผิด)
    - `File too large` (เกิน 2 MB)
    - `Unexpected field` (field ไม่ใช่ `logo`)
    - `Logo file content does not match a jpg, png or webp image` (เนื้อไฟล์ไม่ตรง)
  - ถ้า reverse proxy จำกัดขนาด body ต่ำกว่าไฟล์ จะได้ 413 จาก proxy ที่อาจไม่ใช่ JSON

### DELETE `/api/theme/logo`
- 200: `{ message: string; theme: Theme }`

การแก้ theme ส่ง event `theme_updated` ไปที่ client SSE

---

## 13. System Settings (`/api/system-settings`)

Auth: Admin + permission `settings`

```ts
interface ReceiptSettings {
  entryBill: { showDate?: boolean; showEntryTime?: boolean; showQrCode?: boolean; showBillNo?: boolean; [key: string]: unknown };
  paymentBill: {
    showDate?: boolean;
    showEntryTime?: boolean;
    showQrCode?: boolean;
    showBillNo?: boolean;
    showExpiryTime?: boolean;
    expiryDuration?: number;        // นาทีที่ต้องออกหลังจ่าย จำนวนเต็ม 1-1440
    [key: string]: unknown;
  };
  printer: { fontSize?: number; billNumberFontSize?: number; paperWidth?: number };
  paperWidth?: string | number;
  footerText?: string | null;
}

interface SystemSettings {
  general: { systemName: string | null; location: string | null; language: string | null; timezone: string | null; frontendUrl: string | null };
  receipt: ReceiptSettings;
  billing: Record<string, unknown>;   // เช่น { taxEnabled, currency, roundingMode }
  updatedAt?: DateTimeString;
  configUpdatedAt: DateTimeString | null;
}
```

### GET `/api/system-settings`
- 200: `SystemSettings`

### PUT `/api/system-settings`
- Body: `Partial<{ general: Partial<SystemSettings['general']>; receipt: Partial<ReceiptSettings>; billing: Record<string, unknown> }>` (field ที่ส่งจะรวมกับค่าเดิม ไม่ล้างค่าที่ไม่ได้ส่ง)
  - `receipt.entryBill`, `receipt.paymentBill`, `receipt.printer` รวมราย field เช่นกัน จึงส่งเฉพาะส่วนที่แก้ได้
  - `receipt.printer.fontSize`, `billNumberFontSize`, `paperWidth` ต้อง > 0
- 200: `SuccessMessageResponse`
- Errors: `400 VALIDATION_ERROR` (เช่น `receipt.paymentBill.expiryDuration` ไม่อยู่ใน 1-1440)
- ตัวอย่างแก้เฉพาะใบเสร็จ / เฉพาะ printer (แทนเส้น `/receipt` และ `/receipt/printer` ที่ถูกลบ):
  ```json
  { "receipt": { "paymentBill": { "expiryDuration": 15 } } }
  { "receipt": { "printer": { "fontSize": 12, "billNumberFontSize": 16, "paperWidth": 80 } } }
  ```

---

## 14. Client (`/api/client`)

ใช้โดย Kiosk / Barrier Gate (ส่ง device headers) และ Mobile (ไม่ส่งอะไรเลย)
- backend แยกโหมดจาก `deviceId`: มี = อุปกรณ์ (ต้องมี token), ไม่มี = mobile
- ช่องทางที่บันทึก: Kiosk → `kiosk`, Barrier Gate → `gate`, Mobile → `mobile`

```ts
interface ClientDevice {
  deviceId: string;
  deviceType: 'kiosk' | 'barrier_gate';
  deviceName: string;
  deviceLocation: string | null;
  status: DeviceStatus;
}

type ClientType = 'kiosk' | 'barrier_gate' | 'mobile';

interface ClientTransaction {
  transactionId: string;
  billNo: string;
  plateNo: string;
  vehicleType: VehicleType;
  entryAt: DateTimeString | null;
  calculatedAt: DateTimeString;
  exitTimeLimit: DateTimeString | null;
  isOverstay: boolean;
  status: TransactionStatus;
  amount: { netAmount: Baht; paidAmount: Baht; remainingAmount: Baht };
  duration: { display: string; hours: number; totalMinutes: number };
  feeBreakdown: FeeBreakdown;
  qrData: string;
  clientType: ClientType;
  device: ClientDevice | null;
}
```

### GET `/api/client/config` (Public)
เรียกได้ก่อน activate หรือ login (เดิมคือ `GET /api/v1/devices/config`)
- 200:
  ```ts
  { theme: { systemName: string | null; themeColor: string | null; logoUrl: string | null; themeMode: string; customThemeColor: string | null; updatedAt: DateTimeString | null } }
  ```

### POST `/api/client/activate`
- Auth: Public (rate limit)
- Body: `{ code: string }`
- 200:
  ```ts
  {
    success: true;
    message: string;
    deviceToken: string;              // แสดงครั้งเดียว เก็บไว้ในเครื่อง
    deviceId: string;
    deviceType: 'kiosk' | 'barrier_gate';
    deviceName: string;
    location: string | null;
    status: DeviceStatus;
    // เฉพาะ barrier_gate
    gateId?: string | null;
    direction?: Direction | null;
    cameraIds?: string[];
    printerIds?: string[];
  }
  ```
- Errors: `400 ACTIVATION_CODE_REQUIRED`, `400 INVALID_ACTIVATION_CODE`, `429 TOO_MANY_REQUESTS`

### POST `/api/client/heartbeat`
- Auth: Device (kiosk, barrier_gate, camera, printer)
- Body: `{ name?: string; location?: string }`
- 200: `{ message: string; deviceType: DeviceType; status: DeviceStatus; device: Device }`
- Errors: `401 INVALID_DEVICE`, `403 DEVICE_MAINTENANCE`

### GET `/api/client/transactions`
- Auth: Mobile หรือ Device
- Query: `{ plateNo: string; deviceId?: string }` (`plateNo` อย่างน้อย 4 ตัวอักษร)
- 200: `ClientTransaction | (PlateLookupMultiple & { clientType: ClientType; device: ClientDevice | null })`
  (ไม่คืนรายการที่จบแล้วหรือรถออกไปแล้ว)
- Errors: `400 PLATE_NO_REQUIRED`, `400 INVALID_PLATE_NO`, `404 TRANSACTION_NOT_FOUND`, `403 TRANSACTION_ALREADY_PROCESSED`

### GET `/api/client/transactions/:id`
- Auth: Mobile หรือ Device
- Params: `id: string` (**transaction id เท่านั้น**)
- 200: `ClientTransaction`
- Errors: `404 TRANSACTION_NOT_FOUND`, `403 TRANSACTION_ALREADY_PROCESSED`

### GET `/api/client/payments/methods`
- Auth: Mobile หรือ Device
- 200:
  ```ts
  {
    channel: 'kiosk' | 'gate' | 'mobile';
    methods: AvailablePaymentMethod[];
    edc: { deviceId: string; deviceName: string; terminalId: string } | null;
    clientType: ClientType;
  }
  ```
  - `card` มีเฉพาะ Kiosk/Gate ที่ผูกเครื่อง EDC ที่ active (Mobile ไม่มีบัตร)
- ให้เรียกทุกครั้งก่อนแสดงหน้าเลือกวิธีชำระ

### POST `/api/client/payments/charges` (QR PromptPay)
- Auth: Mobile หรือ Device
- Body:
  ```ts
  { plateNo: string; method: 'promptpay'; sourceType?: string; source?: string; returnUri?: string }
  ```
  - `plateNo` ต้องเป็นทะเบียนเต็ม
  - ไม่ต้องส่ง `source` เพราะ backend สร้าง QR เอง
  - ไม่รับ `amount` และ `token`
- 201: `{ message: string; clientType: ClientType; device: ClientDevice | null; charge: OmiseChargeResponse }`
- Errors:
  - `400`: `PLATE_NO_REQUIRED`, `CARD_TOKEN_NOT_SUPPORTED`, `SOURCE_REQUIRED`, `PAYMENT_METHOD_REQUIRED`, `NO_REMAINING_AMOUNT`, `AMOUNT_BELOW_GATEWAY_MINIMUM` (PromptPay < 20 บาท มี `minimumAmount`, `remainingAmount`), `PAYMENT_SELECTION_INVALID`, `INVALID_RETURN_URI`, `INVALID_PLATE_NO`
  - `404 TRANSACTION_NOT_FOUND`
  - `409 MULTIPLE_PLATE_MATCHES` (มี `candidates: PlateCandidate[]`)
  - `504 OMISE_TIMEOUT`

### GET `/api/client/payments/charges/:chargeId/qr`
- Auth: Public
- Params: `chargeId: string`
- 200: รูปภาพ QR (เฉพาะ charge ที่ยังรอจ่าย)
- Errors: `400 QR_NOT_PAYABLE`, `404 GATEWAY_CHARGE_NOT_FOUND`

### POST `/api/client/payments/edc` (บัตรผ่านเครื่อง EDC)
- Auth: Device (kiosk, barrier_gate) เท่านั้น
- เรียกหลังเครื่อง EDC อนุมัติแล้ว
- Body:
  ```ts
  {
    transactionId?: string;   // แนะนำ (หรือส่ง plateNo เต็ม) ต้องมีอย่างใดอย่างหนึ่ง
    plateNo?: string;
    amount: number | string;  // บาทที่เครื่องตัดจริง > 0
    reference: string;        // เลขอนุมัติ EDC (1-100 ตัว)
    terminalId: string;       // TID จากผลของเครื่อง ต้องตรงกับ EDC ที่ผูกไว้ (1-50 ตัว)
  }
  ```
- 200:
  ```ts
  { message: string; duplicate: boolean; transaction: Transaction; clientType: ClientType; device: ClientDevice }
  ```
  - `duplicate: true` = เคยบันทึก reference นี้แล้ว (retry) ไม่บันทึกซ้ำ
  - Barrier Gate ที่จ่ายครบแล้ว `transaction.status = 'completed'`
- Errors (เกิดหลังเครื่องอนุมัติ → ต้อง void ที่เครื่อง EDC):
  - `400`: `VALIDATION_ERROR`, `PAYMENT_SELECTION_INVALID`, `AMOUNT_EXCEEDS_REMAINING`, `NO_REMAINING_AMOUNT`
  - `403`: `EDC_TERMINAL_NOT_CONFIGURED`, `EDC_TERMINAL_UNAVAILABLE`, `EDC_TERMINAL_MISMATCH`
  - `404 TRANSACTION_NOT_FOUND`
  - `409 PAYMENT_REFERENCE_USED`

### POST `/api/client/payments/test` (Dev Test)
- ใช้ได้เฉพาะเมื่อ backend ตั้ง `ENABLE_PAYMENT_SIMULATION=true`
- Auth: Mobile หรือ Device
- Body:
  ```ts
  { transactionId?: string; plateNo?: string; method?: PaymentMethodId }
  ```
  (ต้องส่ง `transactionId` หรือ `plateNo` เต็มอย่างใดอย่างหนึ่ง)
- 200: `{ message: string; transaction: Transaction; clientType: ClientType; device: ClientDevice | null }`
- Errors: `403 PAYMENT_SIMULATION_DISABLED`, `400 TRANSACTION_ID_OR_PLATE_NO_REQUIRED`, `400 NO_REMAINING_AMOUNT`, `400 PAYMENT_SELECTION_INVALID`, `400 PAYMENT_PROCESSING_FAILED`

### GET `/api/client/events`
- SSE ดู [17.1](#171-client-stream)

---

## 15. Payment Gateway (`/api/payment-gateway`)

### POST `/api/payment-gateway/omise/webhook`
- ใช้โดย Omise เท่านั้น (frontend ไม่ต้องเรียก)
- 200: `{ received: true; action: 'processed' | 'refund_required' | 'already_processed' | 'updated' | 'ignored'; chargeId?: string; status?: string }`

### POST `/api/payment-gateway/omise/simulate-paid` (ทดสอบ)
- ใช้ได้เฉพาะเมื่อ `ENABLE_PAYMENT_SIMULATION=true`
- Header: `x-simulation-token?: string` (ต้องส่งเมื่อ backend ตั้ง `PAYMENT_SIMULATION_TOKEN`)
- Body: `{ chargeId: string; simulationToken?: string }`
- 200: `{ simulated: true; action: string; chargeId: string; status: 'successful'; refundAmount?: Satang; refundReason?: RefundReason; transaction?: Transaction }`
- Errors: `403 PAYMENT_SIMULATION_DISABLED`, `401 INVALID_SIMULATION_TOKEN`, `404 GATEWAY_CHARGE_NOT_FOUND`

---

## 16. Health and Docs

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | Public | `{ status: 'ok'; service: 'smart-carpark-api' }` |
| GET | `/health/db` | Public | `{ status: 'ok' \| 'error'; db: { provider: 'postgresql'; enabled: true; message?: string }; durationMs: number }` (error → 500) |
| GET | `/` | Public | `{ name: 'smart-carpark-api'; docs?: '/docs'; openapi?: '/docs/openapi.json' }` |
| GET | `/docs/openapi.json` | Public | OpenAPI 3 JSON |
| GET | `/docs` | Public | Swagger UI |

---

## 17. Realtime: SSE

ทุก stream ส่งข้อมูลเป็น `data: <JSON>\n\n` และ JSON มี `type` เสมอ
- `ping` ส่งตามรอบที่ backend ตั้ง (`REALTIME_PING_INTERVAL_MS`)
- native `EventSource` ส่ง header ไม่ได้ ให้ใช้ SSE client ที่ส่ง `Authorization` / device headers ได้

```ts
interface PingEvent { type: 'ping'; at: DateTimeString }
interface ConnectedEvent { type: 'connected'; message: string; pingIntervalMs: number; clientType?: ClientType | 'public' } // pingIntervalMs = รอบ ping จริงของ server
interface SessionRevokedEvent { type: 'session_revoked'; reason: SessionEndReason; at: DateTimeString } // Admin stream ปิดหลังส่ง
type SessionEndReason =
  | 'logout' | 'refresh_token_reused' | 'password_changed' | 'user_disabled' | 'user_deleted'
  | 'session_not_found' | 'session_revoked' | 'session_expired' | 'session_idle_expired';
```

### 17.1 Client stream
`GET /api/client/events`
- Auth: Device หรือ Public (Mobile)
- Query: `{ deviceId?: string; gateId?: string; direction?: 'IN' | 'OUT'; cameraId?: string }` (ตัวกรองของ `lpr_detected`)

```ts
type ClientStreamEvent =
  | ConnectedEvent
  | PingEvent
  | { type: 'theme_updated'; theme: Record<string, unknown> }
  | { type: 'payment_settings_updated'; at: DateTimeString }            // ให้เรียก GET /client/payments/methods ใหม่
  | { type: 'device_revoked'; reason: string; at: DateTimeString }      // เฉพาะอุปกรณ์ ล้าง token แล้วไปหน้า activation
  | LprDetectedEvent;                                                    // เฉพาะอุปกรณ์ที่ยืนยันตัวตน

interface LprDetectedEvent {
  type: 'lpr_detected';
  success: boolean;
  openGate: boolean;              // เปิดไม้กั้นเมื่อ true เท่านั้น
  action: GateResponse['action'] | null;
  message: string | null;
  transactionId: string | null;
  plateNo: string;
  vehicleType: VehicleType;
  cameraId: string;
  gateId: string | null;
  direction: Direction;
  status: TransactionStatus | 'not_found' | null;
  exitTimeLimit: DateTimeString | null;
  paymentRequired: boolean;
  reason: string | null;
  remainingAmount: Baht;
  netAmount: Baht;
  totalPaid: Baht;
  checkedAt: DateTimeString;
  capturedAt: DateTimeString;
  emittedAt: DateTimeString;
}
```

- Error ตอนเปิด stream (ตอบเป็น JSON ก่อนเปิด):
  - `401/403 INVALID_DEVICE_CREDENTIALS`
  - `401 UNAUTHORIZED_DEVICE`
  - `403 DEVICE_MAINTENANCE`

### 17.2 Admin streams
Auth: Admin + permission ของกลุ่มนั้น ทุก stream อาจส่ง `session_revoked` แล้วปิด

| Stream | Permission | Event (นอกจาก `connected`, `ping`, `session_revoked`) |
|---|---|---|
| `GET /api/dashboard/events` | dashboard | `dashboard_snapshot`, `dashboard_updated` (`data: DashboardSummary`), `dashboard_error` |
| `GET /api/overview/events?start_date&end_date` | overview | `overview_snapshot`, `overview_updated` (`data: OverviewSummary`), `overview_error` |
| `GET /api/transactions/events?<query เดียวกับ list>` | transactions | `transactions_snapshot`, `transactions_updated` (`data: { data: TransactionListItem[]; meta }`), `transactions_error` |
| `GET /api/devices/events` | devices | `devices_snapshot` (`data` รูปแบบเดียวกับ `GET /api/devices` แบบไม่กรอง พร้อม `generatedAt` ส่งทุกครั้งที่เชื่อมต่อ), `DeviceEvent` 6 type (`device_provisioned`, `device_activated`, `device_activation_expired`, `device_activation_reissued`, `device_status_changed`, `device_deleted`), `devices_config_updated` |
| `GET /api/payments/refunds/events` | transactions | ดู [17.3](#173-refund-stream) |

```ts
interface SummaryEvent<TType extends string, TData> {
  type: TType;
  trigger: {
    reason: 'camera_transaction_created' | 'camera_transaction_updated' | 'payment_processed' | 'transaction_updated'
      | 'transaction_deleted' | 'gateway_refund_required' | 'gateway_refund_resolved' | 'day_changed' | string;
    transactionId: string | null;
    plateNo: string | null;
    at: DateTimeString;
  } | null;                        // snapshot เป็น null
  data: TData;
  generatedAt: DateTimeString;
}

interface StreamErrorEvent { type: 'dashboard_error' | 'overview_error' | 'transactions_error'; message: string; generatedAt: DateTimeString }

interface DeviceEvent {
  type: 'device_provisioned' | 'device_activated' | 'device_activation_expired' | 'device_activation_reissued' | 'device_status_changed' | 'device_deleted';
  deviceId: string | null;
  id: string;
  deviceCode: string;
  deviceType: DeviceType;
  deviceName: string;
  status?: DeviceStatus | 'expired' | 'deleted';
  previousStatus?: string;
  isOnline?: boolean;
  lastSeen?: DateTimeString | null;
  activationExpiresAt?: DateTimeString;
}
interface DevicesSnapshotEvent { type: 'devices_snapshot'; data: DevicesListResponse; generatedAt: DateTimeString } // DevicesListResponse = response ของ GET /api/devices
// devices_config_updated: { type: 'devices_config_updated'; config: { summary; devices: Device[]; masterData; configUpdatedAt } }
```

- Dashboard: พอข้ามวันตามเวลาไทย ping ถัดไปจะส่ง `dashboard_updated` ที่ `trigger.reason = 'day_changed'`
- Devices:
  - ไม่มี event ที่ `type` เป็น `device_event` (ชื่อนี้ใช้ภายใน backend) แต่ละ event ส่ง `type` ของตัวเองตาม `DeviceEvent`
  - `status` ของ `DeviceEvent` อาจเป็น `'expired'` (รอ activate จนหมดอายุ อุปกรณ์ถูกลบแล้ว) หรือ `'deleted'` ซึ่งไม่อยู่ใน `DeviceStatus`
  - `activationExpiresAt` มีเฉพาะ `device_activation_reissued`
- `<name>_snapshot` มี `trigger: null` ถ้าโหลดข้อมูลไม่สำเร็จจะได้ `<name>_error` แทน (overview ตรวจช่วงวันที่ก่อนเปิด stream จึงได้ `400 INVALID_DATE_RANGE` เป็น JSON)

### 17.3 Refund stream
`GET /api/payments/refunds/events` (Admin + `transactions`) เปิดครั้งเดียวที่ layout หลัก

```ts
type RefundStreamEvent =
  | ConnectedEvent
  | PingEvent
  | SessionRevokedEvent
  | { type: 'refunds_snapshot'; pendingCount: number; pendingAmount: Satang; data: RefundItem[]; generatedAt: DateTimeString }
  | (RefundItem & { type: 'refund_required'; applied: boolean; pendingCount: number; pendingAmount: Satang; at: DateTimeString })
  | {
      type: 'refund_resolved';
      chargeId: string;
      transactionId: string;
      plateNo: string;
      resolvedBy: string | null;
      refundNote: string | null;
      refundResolvedAt: DateTimeString;
      refundMethod: 'manual';
      refundId: string | null;
      pendingCount: number;
      pendingAmount: Satang;
      at: DateTimeString;
    }
  | { type: 'payment_settings_updated'; at: DateTimeString };   // ให้เรียก GET /payments/methods ใหม่
```

- `refunds_snapshot` ส่งทุกครั้งที่เชื่อมต่อใหม่ (event ที่เกิดตอนหลุดจะไม่ถูกส่งซ้ำ) ให้กันซ้ำด้วย `chargeId`

---

## 18. Realtime: Payment WebSocket

| Path | Auth |
|---|---|
| `wss://<host>/api/client/payments/ws?chargeId=<id>` (หรือ `?plateNo=`) | Public |
| `wss://<host>/api/payments/ws?chargeId=<id>` | browser ของ Admin: cookie `__Host-cp_access` (browser แนบเอง) จาก Origin ใน `ADMIN_ORIGINS` / client ที่ไม่ใช่ browser: `Authorization: Bearer` / ช่วงเปลี่ยนผ่าน: `&ticket=<ticket>` จาก `POST /api/payments/ws-ticket` user ต้องมี `transactions` |

- handshake ที่มี `Origin` นอก `ADMIN_ORIGINS` ถูกปิดด้วย `4403 'origin_not_allowed'` (กัน Cross-Site WebSocket Hijacking) cookie ใช้ได้เฉพาะเมื่อ `Origin` เป็นของ Admin
- access token ใน cookie หมดอายุได้ `4401 'invalid_token'` ให้ refresh แล้วต่อใหม่ 1 ครั้ง

- `?token=<accessToken>` ยังรับชั่วคราว และจะเอาออกใน release ถัดไปหลัง Admin Frontend แจ้งว่า deploy แบบ ticket แล้ว
- connection ที่ต่อด้วย ticket subscribe ได้แค่ `chargeId` ของ ticket ถ้าส่ง `subscribe` ไป charge หรือทะเบียนอื่นจะได้ `{ type: 'error' }`

- ทั้งสอง path ไม่ตรวจ `Origin` จึงไม่ต้องตั้ง CORS แต่ reverse proxy ต้องเปิด WebSocket upgrade
- ใส่ `chargeId` ใน URL แล้วไม่ต้องส่ง `subscribe` ซ้ำ server subscribe ให้ตั้งแต่เชื่อมต่อ และ replay สถานะล่าสุดทันทีถ้า charge จบแล้ว

### 18.1 Close code ของ Admin path (`/api/payments/ws`)
ตรวจ token ตอน handshake ถ้าไม่ผ่าน server จะ upgrade ก่อนแล้วปิดด้วย close code (browser มองไม่เห็น HTTP 401/403 ของ handshake เห็นแค่ 1006)
ระหว่างเชื่อมต่อจะปิดด้วย code เดียวกันเมื่อ session จบ (ฟัง event และตรวจทุกรอบ ping) access token ที่ใช้ตอน connect หมดอายุอย่างเดียว**ไม่ปิด** ถ้า session ยังใช้ได้

| close code | reason | ความหมาย | frontend ควรทำ |
|---|---|---|---|
| `4401` | `invalid_token` | ticket ผิด/หมดอายุ/ใช้แล้ว/`chargeId` ไม่ตรง หรือ token ไม่มี/ผิด/หมดอายุ (ตอน handshake เท่านั้น) | ขอ ticket ใหม่ (หรือ refresh token) แล้วเชื่อมต่อใหม่ครั้งเดียว ถ้าเจออีกให้ออกจากระบบ |
| `4401` | `SessionEndReason` (ดู [17](#17-realtime-sse)) เช่น `logout`, `session_revoked`, `session_expired`, `session_idle_expired`, `password_changed`, `user_disabled`, `user_deleted` | session จบแล้ว | ไปหน้า login ไม่เชื่อมต่อใหม่ |
| `4403` | `forbidden` | ไม่มี permission `transactions` (ตอน handshake หรือถูกถอดสิทธิ์ระหว่างเชื่อมต่อ) | แสดงหน้าไม่มีสิทธิ์ ไม่เชื่อมต่อใหม่ |
| `1011` | `internal_error` | server ตรวจ token ไม่ได้ (เช่น database มีปัญหา) | เชื่อมต่อใหม่แบบ backoff |
| อื่น ๆ (`1006`, `1001` ฯลฯ) | - | network, proxy หรือ server restart | เชื่อมต่อใหม่แบบ backoff |

- logout แล้ว handshake ด้วย token เดิมจะได้ reason `session_revoked` (ส่วน `logout` ได้จาก connection ที่เปิดอยู่ตอน logout)
- path ที่ไม่มีจริงยังตอบ HTTP 404 ตอน handshake
- Client path (`/api/client/payments/ws`) ไม่มี auth และไม่มี close code เหล่านี้

- ข้อความจาก client (ไม่เกิน 16 KB):
  ```ts
  { type: 'subscribe'; chargeId?: string; plateNo?: string }
  ```
- ข้อความจาก server:
  ```ts
  type PaymentSocketMessage =
    | { type: 'connected'; message: string; subscribed: { plateNo: string | null; chargeId: string | null } }
    | { type: 'subscribed' }
    | { type: 'error'; message: string }
    | PaymentUpdatedEvent;

  // successful มีครบทุก field, failed/expired/reversed มีแค่ chargeId, plateNo, paymentStatus, gatewayCharge, emittedAt
  // replay ตอนเชื่อมต่อมี replayed: true และไม่มี applied
  interface PaymentUpdatedEvent {
    type: 'payment_updated';
    provider: 'omise';
    chargeId: string;
    plateNo: string;
    transactionId?: string;
    paymentStatus: 'successful' | 'failed' | 'expired' | 'reversed' | 'pending' | string;
    transactionStatus?: TransactionStatus | null;
    remainingAmount?: Baht | null;
    exitTimeLimit?: DateTimeString | null;
    applied?: boolean;                 // false = เงินเข้าแต่ลงในรายการไม่ได้
    refundRequired?: boolean;
    refundAmount?: Satang | null;
    refundReason?: RefundReason | null;
    gatewayCharge: Omit<GatewayCharge, 'raw'>;
    replayed?: true;                   // ส่งซ้ำสถานะล่าสุดตอน subscribe
    emittedAt: DateTimeString;
  }
  ```
- server ส่ง ping frame ตามรอบ `REALTIME_PING_INTERVAL_MS` ถ้าหลุดให้เชื่อมต่อใหม่ด้วย `chargeId` เดิมและ access token ล่าสุด (จะได้สถานะล่าสุดทันที)
- event เก็บใน memory ของ API process เดียว (รัน API ได้ instance เดียว)

---

## 19. Error Codes

| Code | HTTP | ความหมาย |
|---|---|---|
| `VALIDATION_ERROR` | 400 | ข้อมูลไม่ถูกต้อง ดู `errors[]` |
| `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_SESSION` | 401 | ไม่มีหรือ token/session ใช้ไม่ได้ |
| `FORBIDDEN` | 403 | ไม่มี permission |
| `ROUTE_NOT_FOUND` | 404 | ไม่มี endpoint นี้ |
| `TOO_MANY_REQUESTS`, `TOO_MANY_LOGIN_ATTEMPTS` | 429 | เรียกถี่เกิน |
| `INTERNAL_SERVER_ERROR` | 500 | error ภายใน (production ไม่ส่งรายละเอียด) |
| `INVALID_DEVICE_CREDENTIALS` | 401/403 | device token ใช้ไม่ได้ `reason`: `not_found` / `invalid_type` / `inactive` / `invalid_token` / `ip_not_allowed` |
| `DEVICE_ID_REQUIRED`, `DEVICE_IDENTITY_MISMATCH` | 400 | ไม่ได้ส่ง deviceId / ส่งหลายค่าไม่ตรงกัน |
| `DEVICE_CREDENTIALS_REQUIRED`, `INVALID_DEVICE`, `UNAUTHORIZED_DEVICE` | 401 | อุปกรณ์ไม่ได้ยืนยันตัวตน |
| `DEVICE_MAINTENANCE` | 403 | อุปกรณ์ปิดปรับปรุง |
| `TRANSACTION_NOT_FOUND` | 404 | ไม่พบรายการ |
| `TRANSACTION_ALREADY_PROCESSED` | 403 | รายการจบแล้ว (client) |
| `INVALID_PLATE_NO`, `PLATE_NO_REQUIRED` | 400 | ทะเบียนไม่ถูกต้องหรือสั้นเกิน |
| `MULTIPLE_PLATE_MATCHES` | 409 | ทะเบียนตรงหลายคัน มี `candidates` |
| `NO_REMAINING_AMOUNT` | 400 | ไม่มียอดต้องจ่าย |
| `AMOUNT_EXCEEDS_REMAINING` | 400 | ยอดเกินยอดค้าง มี `remainingAmount` |
| `INVALID_AMOUNT`, `AMOUNT_MISMATCH` | 400 | amount ไม่ถูกต้อง / ไม่ตรงยอดค้าง (Admin charge) |
| `PAYMENT_SELECTION_INVALID` | 400 | method ปิดอยู่หรือไม่อนุญาตในช่องทางนี้ |
| `PENDING_GATEWAY_CHARGE` | 409 | มี QR PromptPay ที่ยังสแกนได้ |
| `PAYMENT_REFERENCE_REQUIRED`, `PAYMENT_REFERENCE_USED` | 400 / 409 | ไม่มีเลขอ้างอิง EDC / เลขนี้ถูกใช้กับรายการอื่นแล้ว |
| `EDC_DEVICE_REQUIRED`, `EDC_DEVICE_NOT_FOUND`, `EDC_DEVICE_NOT_CASHIER`, `EDC_DEVICE_UNAVAILABLE` | 400 / 409 | การเลือกเครื่อง EDC ของเคาน์เตอร์ไม่ถูกต้อง |
| `EDC_TERMINAL_NOT_CONFIGURED`, `EDC_TERMINAL_UNAVAILABLE`, `EDC_TERMINAL_MISMATCH` | 403 | EDC ของ Kiosk/Gate ไม่ได้ผูก / ไม่ active / TID ไม่ตรง |
| `ADMIN_CHANNEL_MUST_BE_CASHIER`, `ADMIN_CARD_NOT_SUPPORTED`, `CARD_TOKEN_NOT_SUPPORTED` | 400 | channel ผิด / ห้ามส่ง card token |
| `SOURCE_REQUIRED`, `PAYMENT_METHOD_REQUIRED`, `INVALID_RETURN_URI` | 400 | ข้อมูลสร้าง charge ไม่ครบ |
| `QR_NOT_PAYABLE`, `CHARGE_ID_REQUIRED` | 400 | QR หมดอายุ/จ่ายแล้ว / ไม่ได้ส่ง chargeId |
| `OMISE_TIMEOUT` | 504 | Omise ตอบช้า |
| `REFUND_NOT_REQUIRED`, `REFUND_ALREADY_RESOLVED` | 400 / 409 | สถานะการคืนเงิน |
| `PAYMENT_SIMULATION_DISABLED` | 403 | โหมดทดสอบปิดอยู่ |
| `INVALID_STATUS_TRANSITION`, `ACTIVE_TRANSACTION_EXISTS`, `TRANSACTION_HAS_PAYMENTS` | 409 | แก้/ลบรายการไม่ได้ |
| `INVALID_DATE_RANGE` | 400 | ช่วงวันที่ไม่ถูกต้อง |
| `INVALID_PRICING_RULES`, `PRICING_CONFIG_CONFLICT` | 400 / 409 | กติกาค่าจอดผิด / มีคนบันทึก pricing ไปก่อน (โหลดใหม่แล้วส่งอีกครั้ง) |
| `PAYMENT_METHOD_PROTECTED`, `PAYMENT_CHANNEL_PROTECTED` | 409 | ลบ method/channel หลักไม่ได้ |
| `DEVICE_TYPE_IMMUTABLE`, `EDC_USAGE_INVALID`, `EDC_OWNER_INVALID`, `EDC_DEVICE_IN_USE`, `EDC_TERMINAL_ID_EXISTS` | 400 / 409 | การแก้อุปกรณ์/การผูก EDC ไม่ถูกต้อง |
| `PERMISSION_NOT_GRANTABLE`, `SUPER_ADMIN_REQUIRED`, `LAST_SUPER_ADMIN`, `CANNOT_DELETE_SELF`, `CANNOT_DISABLE_SELF` | 403 / 409 | กฎการจัดการสมาชิก |
| `CSRF_REJECTED` | 403 | request ที่ใช้ cookie ไม่ได้มาจาก origin ของ Admin หรือ login/refresh/logout จาก origin อื่น |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | request ที่ใช้ cookie ส่ง body ที่ไม่ใช่ JSON |
| `AMOUNT_BELOW_GATEWAY_MINIMUM` | 400 | ยอดค้างต่ำกว่าขั้นต่ำของ Omise (PromptPay 20 บาท) มี `minimumAmount`, `remainingAmount` |
| `DEVICE_MAPPING_NOT_SUPPORTED` | 400 | ผูกกล้อง/printer กับประเภทอุปกรณ์ที่ไม่รองรับ |
| `CAMERA_IN_USE` | 409 | กล้องผูกกับ Barrier Gate อื่นอยู่แล้ว มี `cameraIds`, `assignedTo` |
| `INVALID_DEVICE_MAPPING` | 400 | `cameraIds`/`printerIds` มี id ที่ไม่ใช่กล้อง/printer ที่ลงทะเบียน มี `field`, `invalidIds` |
| `BAD_REQUEST` | 400 / 413 | error ที่ไม่ใช่ของ API เช่น JSON body พัง (400) หรือ body เกิน 1mb (413) |
| `CORS_NOT_ALLOWED` | 403 | request มี `Origin` ที่ไม่อยู่ใน `ADMIN_ORIGINS` และ `CLIENT_ORIGINS` |
| `INVALID_CREDENTIALS` | 401 | username/password ผิด |
| `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED` | 401 | refresh token ใช้ไม่ได้ / session หมดอายุ ให้ login ใหม่ |
| `LOGO_FILE_REQUIRED`, `INVALID_LOGO_FILE` | 400 | ไม่ได้แนบโลโก้ / ไฟล์ผิดประเภท เกิน 2 MB field ผิด หรือเนื้อไฟล์ไม่ตรง (ดู `message`) |
| `USERNAME_REQUIRED`, `PASSWORD_REQUIRED`, `NAME_REQUIRED` | 400 | ข้อมูลสร้างสมาชิกไม่ครบ |
| `USERNAME_TAKEN` | 409 | username ซ้ำ |
| `MEMBER_NOT_FOUND` | 404 | ไม่พบสมาชิก |
| `PAYMENT_METHOD_NOT_FOUND`, `PAYMENT_CHANNEL_NOT_FOUND` | 404 | ไม่พบ method/channel (หรือ allowedMethods มี method ที่ไม่มีจริง) |
| `DEVICE_NOT_FOUND` | 404 | ไม่พบอุปกรณ์ |
| `DEVICE_CODE_EXISTS` | 409 | deviceCode ซ้ำ |
| `DEVICE_TYPE_NOT_ACTIVATABLE`, `EDC_TERMINAL_ID_REQUIRED`, `DEVICE_UPDATE_FAILED`, `ACTIVATION_REISSUE_FAILED` | 400 | สร้าง/แก้อุปกรณ์หรือออก activation code ไม่ได้ (error ของ Devices มี `status: 'error'`) |
| `TRANSACTION_ID_OR_PLATE_NO_REQUIRED`, `TRANSACTION_NOT_PAYABLE` | 400 | ไม่ได้ส่ง transactionId/plateNo / รายการปิดแล้วจ่ายไม่ได้ |
| `GATEWAY_CHARGE_NOT_FOUND` | 404 | ไม่พบ charge |
| `NOT_OMISE_CHARGE`, `QR_ONLY_FOR_PROMPTPAY` | 400 | charge นี้ไม่ใช่ของ Omise / ขอ QR ได้เฉพาะ PromptPay |
| `CHARGE_ID_OR_DOCUMENT_PATH_REQUIRED`, `DOCUMENT_PATH_REQUIRED`, `INVALID_OMISE_DOCUMENT_PATH` | 400 | ขอรูป QR หรือเอกสาร Omise ไม่ถูกต้อง |
| `INVALID_PAYMENT_AMOUNT`, `SOURCE_OR_TOKEN_REQUIRED` | 400 | ข้อมูลสร้าง charge ส่งไป Omise ไม่ครบ |
| `CHARGE_VERIFY_TOO_FREQUENT` | 429 | กดตรวจสอบ charge เดิมภายใน 10 วินาที (มี `Retry-After`) |
| `OMISE_NOT_CONFIGURED` | 500 | backend ยังไม่ตั้ง `OMISE_SECRET_KEY` |
| `OMISE_DOCUMENT_UNAVAILABLE`, `OMISE_QR_DOCUMENT_NOT_FOUND` | 502 | ดึงรูป QR จาก Omise ไม่ได้ |
| code ของ Omise (เช่น `invalid_charge`) | ตาม Omise | error จาก Omise มี `provider: 'omise'` และ `location` |
| `ACTIVATION_CODE_REQUIRED`, `INVALID_ACTIVATION_CODE` | 400 | activation code ของ Kiosk/Barrier Gate ไม่มีหรือผิด |
| `CAMERA_ID_MISMATCH`, `CAMERA_GATE_VALIDATION_ERROR` | 400 / 403 | event ของกล้อง LPR ไม่ตรงกับอุปกรณ์หรือ Barrier Gate ที่ผูก |
| `PAYMENT_CHANNEL_REQUIRED`, `PAYMENT_PROCESSING_FAILED` | 400 | ช่องทางของ client ไม่ครบ / Dev Test บันทึกการชำระไม่สำเร็จ |
| `CHARGE_ID_NOT_FOUND`, `INVALID_WEBHOOK_SIGNATURE`, `INVALID_SIMULATION_TOKEN` | 400 / 401 | ใช้กับ webhook และ simulate-paid เท่านั้น |

Close code ของ Admin payment WebSocket (`4401`, `4403`, `1011`) ดู [18.1](#181-close-code-ของ-admin-path-apipaymentsws)

---

## 20. ใครใช้เส้นไหน

| กลุ่ม | Admin Frontend | Kiosk | Barrier Gate | Mobile |
|---|---|---|---|---|
| Auth (3) | ✅ | | | |
| Dashboard / Overview (4, 5) | ✅ | | | |
| Transactions (6) | ✅ (`POST /` ใช้โดยกล้อง) | | | |
| Payments (7) | ✅ | | | |
| Members, Pricing, Payment Settings, Theme, System Settings (8-10, 12, 13) | ✅ | | | |
| Devices (11) | ✅ | | | |
| `GET /client/config` | | ✅ | ✅ | ✅ |
| `POST /client/activate`, `/client/heartbeat` | | ✅ | ✅ | |
| `GET /client/transactions`, `/client/transactions/:id` | | ✅ | ✅ | ✅ (`/:id`) |
| `GET /client/payments/methods` | | ✅ | ✅ | ✅ |
| `POST /client/payments/charges`, `GET /client/payments/charges/:chargeId/qr` | | ✅ | ✅ | ✅ |
| `POST /client/payments/edc` | | ✅ | ✅ | |
| `GET /client/events` | | ✅ | ✅ (`lpr_detected`) | ✅ (theme / settings) |
| Payment WebSocket (18) | admin path | client path | client path | client path |
