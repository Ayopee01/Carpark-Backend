// Import Types
import type { PaymentRecord } from '../types/shared/transaction.type';

/* -------------------------------------- Functions -------------------------------------- */

// Function บังคับค่า JSON ให้เป็น array
function toJsonArray<T = PaymentRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export { toJsonArray };
