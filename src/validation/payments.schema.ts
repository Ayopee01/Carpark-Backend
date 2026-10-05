// Import Library
import { z } from 'zod';
// Import Validation
import { nonEmptyString, nullableString } from './zod';

/* -------------------------------------- Admin Payment Schemas -------------------------------------- */

// Schema body สำหรับบันทึกว่าคืนเงินของ gateway charge แล้ว
const resolveRefundBodySchema = z.object({
  note: nullableString('note'),
});

// Schema body สำหรับขอ ticket ต่อ Admin payment WebSocket
const socketTicketBodySchema = z.object({
  chargeId: nonEmptyString('chargeId').max(100, 'chargeId must be at most 100 characters'),
});

export { resolveRefundBodySchema, socketTicketBodySchema };
