// Import Library
import crypto from 'crypto';
import https from 'https';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
import omiseFactory from 'omise';
// Import Types
import type { CreateChargeInput, OmiseChargeData, OmiseClient, OmiseDocumentFile, OmiseErrorLike, OmiseWebhookEvent } from '../../types/shared/payment.type';
// Import Utils
import { ApiError } from '../../utils/api-error';

/* -------------------------------------- Config -------------------------------------- */

// Config host ของ Omise API ที่อนุญาตให้ดาวน์โหลดเอกสาร
const OMISE_API_HOST = 'api.omise.co';

// Config จำนวน redirect สูงสุดตอนดาวน์โหลดเอกสาร QR
const MAX_DOCUMENT_REDIRECTS = 3;

// Config อายุ QR PromptPay (นาที) จาก OMISE_QR_EXPIRY_MINUTES (ต้องตั้งใน .env, Omise รับได้ไม่เกิน 24 ชม.) ไม่ได้ตั้งหรือค่าผิดให้ throw ตอนเริ่ม
const QR_EXPIRY_MINUTES = (() => {
  const raw = process.env.OMISE_QR_EXPIRY_MINUTES;
  if (!raw) throw new Error('OMISE_QR_EXPIRY_MINUTES is required');
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 24 * 60) throw new Error('OMISE_QR_EXPIRY_MINUTES must be an integer between 1 and 1440');
  return value;
})();

// Config สกุลเงินที่ส่งให้ Omise จาก OMISE_CURRENCY (ต้องตั้งใน .env เป็นรหัส 3 ตัว เช่น thb)
const OMISE_CURRENCY = (() => {
  const raw = process.env.OMISE_CURRENCY;
  if (!raw) throw new Error('OMISE_CURRENCY is required');
  if (!/^[a-z]{3}$/i.test(raw)) throw new Error('OMISE_CURRENCY must be a 3-letter currency code such as thb');
  return raw.toLowerCase();
})();

// Config เวลารอ Omise API สูงสุด (ms) กัน request ค้างเมื่อ Omise ตอบช้า
const OMISE_REQUEST_TIMEOUT_MS = 15 * 1000;

// production ที่ตั้ง Omise secret key ต้องมี webhook secret ไม่งั้นใครก็ยิง webhook ปลอมได้
if (process.env.NODE_ENV === 'production' && process.env.OMISE_SECRET_KEY && !process.env.OMISE_WEBHOOK_SECRET) {
  throw new Error('OMISE_WEBHOOK_SECRET is required when OMISE_SECRET_KEY is set in production');
}

// Config Omise client ที่สร้างแล้ว (สร้างครั้งแรกตอนเรียกใช้)
let omiseClient: OmiseClient | null = null;

/* -------------------------------------- Helpers -------------------------------------- */

// Function สร้างหรือคืน Omise client จาก OMISE_SECRET_KEY
function getOmiseClient(): OmiseClient {
  if (omiseClient) return omiseClient;
  const secretKey = process.env.OMISE_SECRET_KEY;
  if (!secretKey) throw new ApiError(500, 'OMISE_NOT_CONFIGURED', 'OMISE_SECRET_KEY is not configured');

  omiseClient = omiseFactory({ secretKey });
  return omiseClient;
}

// Function รอ promise ของ Omise ไม่เกิน OMISE_REQUEST_TIMEOUT_MS ถ้าเกิน throw 504 OMISE_TIMEOUT
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ApiError(504, 'OMISE_TIMEOUT', 'Omise request timed out', { provider: 'omise' })), OMISE_REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Function สร้าง error ตอนดาวน์โหลดเอกสาร QR จาก Omise ไม่สำเร็จ
function documentError(message: string): ApiError {
  return new ApiError(502, 'OMISE_DOCUMENT_UNAVAILABLE', message, { provider: 'omise' });
}

// Function request binary file จาก Omise document endpoint
function requestBinary(url: URL | string, { authenticated = false, redirectCount = 0 }: { authenticated?: boolean; redirectCount?: number } = {}): Promise<OmiseDocumentFile> {
  return new Promise<OmiseDocumentFile>((resolve, reject) => {
    const requestUrl = url instanceof URL ? url : new URL(url);
    const headers: OutgoingHttpHeaders = { Accept: 'image/*' };
    if (authenticated) {
      const secretKey = process.env.OMISE_SECRET_KEY;
      if (!secretKey) return reject(new ApiError(500, 'OMISE_NOT_CONFIGURED', 'OMISE_SECRET_KEY is not configured'));
      headers.Authorization = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
    }

    const requestOptions = {
      protocol: requestUrl.protocol,
      hostname: requestUrl.hostname,
      port: requestUrl.port || undefined,
      path: `${requestUrl.pathname}${requestUrl.search || ''}`,
      method: 'GET',
      headers,
    };

    const req = https.request(requestOptions, (res) => {
      const location = res.headers.location;
      const statusCode = res.statusCode ?? 0;
      if (location && statusCode >= 300 && statusCode < 400) {
        res.resume();
        if (redirectCount >= MAX_DOCUMENT_REDIRECTS) return reject(documentError('Too many Omise document redirects'));
        const nextUrl = new URL(location, requestUrl);
        return resolve(requestBinary(nextUrl, {
          authenticated: nextUrl.hostname === OMISE_API_HOST,
          redirectCount: redirectCount + 1,
        }));
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (statusCode < 200 || statusCode >= 300) {
          let message = `Unable to load Omise QR image (${statusCode})`;
          try {
            const parsed = JSON.parse(body.toString('utf8'));
            message = parsed.message || message;
          } catch {
            if (body.length) message = body.toString('utf8');
          }
          return reject(documentError(message));
        }

        const contentType = res.headers['content-type'] || 'image/png';
        if (!contentType.toLowerCase().startsWith('image/')) {
          let downloadUri: string | null = null;
          try {
            const parsed = JSON.parse(body.toString('utf8'));
            downloadUri = parsed.download_uri || parsed.downloadUri || null;
          } catch {
            // ใช้ error กลางด้านล่างเมื่อ Omise ไม่ได้ส่ง JSON กลับมา
          }

          if (downloadUri) {
            if (redirectCount >= MAX_DOCUMENT_REDIRECTS) return reject(documentError('Too many Omise document redirects'));
            const nextUrl = new URL(downloadUri, requestUrl);
            return resolve(requestBinary(nextUrl, {
              authenticated: nextUrl.hostname === OMISE_API_HOST,
              redirectCount: redirectCount + 1,
            }));
          }

          return reject(documentError('Omise document response is not an image'));
        }

        return resolve({ contentType, body });
      });
    });

    req.setTimeout(OMISE_REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Omise document request timed out')));
    req.on('error', (err) => {
      reject(documentError(err.message || 'Unable to load Omise QR image'));
    });
    req.end();
  });
}

// Function แยก signature header ของ Omise เป็นรายการ key/value
function parseSignatureHeader(signatureHeader: unknown): { key: string; value: string }[] {
  if (!signatureHeader) return [];
  return String(signatureHeader)
    .split(',')
    .map((part) => part.trim())
    .flatMap((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return [{ key: 'signature', value: part }];
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      return value ? [{ key, value }] : [];
    })
    .filter((item) => item.value);
}

// Function เทียบ signature แบบ timing-safe
function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลง error จาก Omise เป็น ApiError โดยคง code ของ Omise ไว้ใน response ตามเดิม
function toOmiseApiError(err: unknown): ApiError {
  const error = (err ?? {}) as OmiseErrorLike;
  const message = error.message || error.toString?.() || 'Omise request failed';
  const statusCode = error.object === 'error' || error.code ? 400 : 502;
  return new ApiError(statusCode, error.code || null, message, { provider: 'omise', location: error.location || null });
}

// Function ตรวจ path เอกสารของ Omise ให้เป็น /charges|/sources/.../documents/... บน api.omise.co เท่านั้น
function normalizeDocumentPath(documentPath: unknown): string {
  const value = String(documentPath || '').trim();
  if (!value) throw new ApiError(400, 'DOCUMENT_PATH_REQUIRED', 'documentPath is required');

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname !== OMISE_API_HOST) throw new ApiError(400, 'INVALID_OMISE_DOCUMENT_PATH', 'Invalid Omise document URL');
    path = `${url.pathname}${url.search || ''}`;
  }

  if (!/^\/(charges|sources)\/[^/]+\/documents\/[^/?#]+(\/download|\/downloads\/[^/?#]+)?(\?.*)?$/.test(path)) {
    throw new ApiError(400, 'INVALID_OMISE_DOCUMENT_PATH', 'Invalid Omise document path');
  }

  return path;
}

// Function แปลงสถานะ charge ของ Omise เป็น successful/failed/expired/reversed/pending
function normalizeChargeStatus(charge: Partial<OmiseChargeData> | null | undefined): string {
  if (!charge) return 'unknown';
  if (charge.paid === true || charge.status === 'successful') return 'successful';
  if (charge.status === 'failed' || charge.failure_code) return 'failed';
  if (charge.status === 'expired') return 'expired';
  if (charge.status === 'reversed') return 'reversed';
  return charge.status || 'pending';
}

// Function อ่านเวลาจ่ายสำเร็จจาก charge
function getChargePaidAt(charge: Partial<OmiseChargeData> | null | undefined): string | null {
  return charge?.paid_at || charge?.paidAt || (charge?.paid ? new Date().toISOString() : null);
}

// Function แปลงจำนวนเงินบาทเป็นหน่วยสตางค์ที่ Omise ใช้
function toMinorAmount(amount: unknown): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new ApiError(400, 'INVALID_PAYMENT_AMOUNT', 'Invalid payment amount');
  return Math.round(value * 100);
}

// Function ดาวน์โหลดเอกสาร (รูป QR) จาก Omise
async function downloadDocument(documentPath: unknown): Promise<OmiseDocumentFile> {
  const path = normalizeDocumentPath(documentPath);
  return requestBinary(new URL(path, `https://${OMISE_API_HOST}`), { authenticated: true });
}

// Function คำนวณเวลาหมดอายุของ QR PromptPay ที่จะสร้างตอนนี้
function getQrExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + QR_EXPIRY_MINUTES * 60 * 1000).toISOString();
}

// Function สร้าง charge ผ่าน Omise API (expiresAt ใช้กำหนดอายุ QR PromptPay)
async function createCharge({ amount, source, token, description, metadata, returnUri, expiresAt }: CreateChargeInput): Promise<OmiseChargeData> {
  if (!source && !token) throw new ApiError(400, 'SOURCE_OR_TOKEN_REQUIRED', 'source or token is required');

  const payload = {
    amount: toMinorAmount(amount),
    currency: OMISE_CURRENCY,
    description,
    metadata,
    ...(source ? { source } : {}),
    ...(token ? { card: token } : {}),
    ...(returnUri ? { return_uri: returnUri } : {}),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  };

  try {
    return (await withTimeout(getOmiseClient().charges.create(payload as unknown as Parameters<OmiseClient['charges']['create']>[0]))) as unknown as OmiseChargeData;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toOmiseApiError(err);
  }
}

// Function ดึง charge ล่าสุดจาก Omise
async function retrieveCharge(chargeId: string): Promise<OmiseChargeData> {
  if (!chargeId) throw new ApiError(400, 'CHARGE_ID_REQUIRED', 'chargeId is required');
  try {
    return (await withTimeout(getOmiseClient().charges.retrieve(chargeId))) as unknown as OmiseChargeData;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toOmiseApiError(err);
  }
}

// Function ตรวจสอบ webhook signature จาก Omise
function verifyWebhookSignature(rawBody: string | null | undefined, headers: IncomingHttpHeaders): boolean {
  const secret = process.env.OMISE_WEBHOOK_SECRET;
  if (!secret) return true;

  const signatureHeader = headers['omise-signature'];
  const timestamp = headers['omise-signature-timestamp'];
  if (!signatureHeader || !timestamp || !rawBody) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = Buffer.from(secret, 'base64');
  const expectedHex = crypto.createHmac('sha256', key).update(signedPayload).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', key).update(signedPayload).digest('base64');

  return parseSignatureHeader(signatureHeader).some(({ value }) => {
    return timingSafeEqual(value, expectedHex) || timingSafeEqual(value, expectedBase64);
  });
}

// Function ดึง chargeId จาก Omise event (event ของ object อื่น เช่น refund หรือ transfer คืน null)
function extractChargeIdFromEvent(event: OmiseWebhookEvent | null | undefined): string | null {
  const data = event?.data;
  if (data?.object && data.object !== 'charge') return null;
  return data?.id || event?.charge || event?.chargeId || null;
}

// Function ตรวจว่า Omise event เป็น event ของ object อื่นที่ไม่ใช่ charge
function isNonChargeEvent(event: OmiseWebhookEvent | null | undefined): boolean {
  return Boolean(event?.data?.object) && event?.data?.object !== 'charge';
}

export { createCharge, downloadDocument, extractChargeIdFromEvent, getChargePaidAt, getQrExpiresAt, isNonChargeEvent, normalizeChargeStatus, normalizeDocumentPath, retrieveCharge, toMinorAmount, toOmiseApiError, verifyWebhookSignature };
