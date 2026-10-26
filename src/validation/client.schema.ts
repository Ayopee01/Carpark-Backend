// Import Library
import { z } from 'zod';
// Import Validation
import { requiredText } from './zod';

/* -------------------------------------- Client Schemas -------------------------------------- */

// Schema body ของ kiosk/barrier gate ที่เปิดใช้งานด้วย activation code
const activateDeviceBodySchema = z.object({
  code: requiredText('Activation code is required'),
});

// Schema body ของ heartbeat (deviceId ถูกเติมจาก device auth ถ้าส่งมาทาง header) field อื่นส่งต่อตามเดิม
const heartbeatBodySchema = z.looseObject({
  deviceId: requiredText('deviceId is required'),
});

// Schema query/body ที่ต้องมีทะเบียนรถ (ค้นหารายการ, สร้าง Omise charge ของ client)
const plateNoInputSchema = z.looseObject({
  plateNo: requiredText('plateNo is required'),
});

// Schema body ของการจ่ายเงินแบบ Dev Test ต้องระบุ transactionId หรือ plateNo อย่างใดอย่างหนึ่ง
const clientPayBodySchema = z.object({
  transactionId: z.string({ error: 'transactionId must be a string' }).optional(),
  plateNo: z.string({ error: 'plateNo must be a string' }).optional(),
  method: z.string({ error: 'method must be a string' }).optional(),
}).refine((body) => body.transactionId || body.plateNo, { error: 'transactionId or plateNo is required', path: ['transactionId'] });

/* -------------------------------------- Error Codes -------------------------------------- */

// Config error code ของแต่ละ field (คง code เดิมที่อุปกรณ์และ frontend ใช้)
const CLIENT_ERROR_CODES = {
  activate: { code: 'ACTIVATION_CODE_REQUIRED' },
  heartbeat: { deviceId: 'DEVICE_ID_REQUIRED' },
  plateNo: { plateNo: 'PLATE_NO_REQUIRED' },
  pay: { transactionId: 'TRANSACTION_ID_OR_PLATE_NO_REQUIRED' },
};

export { CLIENT_ERROR_CODES, activateDeviceBodySchema, clientPayBodySchema, heartbeatBodySchema, plateNoInputSchema };
