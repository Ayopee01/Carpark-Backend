// Import Library
import { randomUUID } from 'node:crypto';

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง id แบบสุ่มพร้อม prefix บอกชนิดข้อมูล เช่น t_, u_, sess_
function createId(prefix: string = 'id'): string {
  return `${prefix}_${randomUUID()}`;
}

export { createId };
