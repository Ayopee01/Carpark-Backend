// Import Config
import { prisma } from '../../db/prisma';
// Import Types
import type { DbClient } from '../../types/shared/common.type';

/* -------------------------------------- Functions -------------------------------------- */

// Function เลือก prisma client ปกติ หรือ transaction client ที่ส่งเข้ามา
function client(connection?: DbClient): DbClient {
  return connection ?? prisma;
}

export { client };
