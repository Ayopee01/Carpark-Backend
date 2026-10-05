// Import Types
import type { OpenApiObject, SecurityRequirement } from '../../types/shared/common.type';

/* -------------------------------------- Config -------------------------------------- */

// Config security ของ route ที่ต้องใช้ Bearer access token
const bearer: SecurityRequirement[] = [{ bearerAuth: [] }];

// Config security ของ route ที่ต้องใช้ device credentials (X-Device-Id + X-Device-Token หรือ Authorization: Device)
const deviceAuth: SecurityRequirement[] = [{ deviceIdHeader: [], deviceTokenHeader: [] }, { deviceBearerAuth: [] }];

// Config security ของ route public
const publicRoute: SecurityRequirement[] = [];

// Config security ของ route ที่ mobile เรียกได้โดยไม่มี credentials แต่ kiosk/barrier gate ที่ส่ง deviceId ต้องส่ง token ด้วย
const optionalDeviceRoute: SecurityRequirement[] = [{}, ...deviceAuth];

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง content แบบ application/json พร้อม example ถ้ามี
const json = (schema: OpenApiObject, example?: unknown): OpenApiObject => ({
  'application/json': {
    schema,
    ...(example !== undefined ? { example } : {}),
  },
});

// Function สร้าง reference ไปยัง schema ใน components
const ref = (name: string): OpenApiObject => ({ $ref: `#/components/schemas/${name}` });

// Function สร้าง request body
const body = (schema: OpenApiObject, example?: unknown, required = true): OpenApiObject => ({
  required,
  content: json(schema, example),
});

// Function สร้าง response สำเร็จ
const ok = (description = 'OK', schema: OpenApiObject = ref('AnyObject'), example?: unknown): OpenApiObject => ({
  description,
  content: json(schema, example),
});

// Function สร้าง error response ที่ใช้ ErrorResponse schema
const error = (description: string): OpenApiObject => ({
  description,
  content: json(ref('ErrorResponse')),
});

// Function สร้าง path parameter
const idParam = (name = 'id', example = 't_123'): OpenApiObject => ({
  in: 'path',
  name,
  required: true,
  schema: { type: 'string' },
  example,
});

// Function สร้าง query parameter
const query = (name: string, schema: OpenApiObject, example?: unknown, required = false): OpenApiObject => ({
  in: 'query',
  name,
  required,
  schema,
  ...(example !== undefined ? { example } : {}),
});

/* -------------------------------------- Responses -------------------------------------- */

// Config error response ของ route ที่ต้อง login และมี permission
const bearer403: Record<number, OpenApiObject> = {
  401: error('Missing, invalid, expired, or revoked access token'),
  403: error('Authenticated user does not have the required permission'),
};

// Config error response ของ route ที่แก้ไข config
const configWriteResponses: Record<number, OpenApiObject> = {
  400: error('Missing required fields or invalid payload'),
  401: error('Missing, invalid, expired, or revoked access token'),
  403: error('Authenticated user does not have the required permission'),
};

export { bearer, bearer403, body, configWriteResponses, deviceAuth, error, idParam, json, ok, optionalDeviceRoute, publicRoute, query, ref };
