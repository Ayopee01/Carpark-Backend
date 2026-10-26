// Import Repositories
import { client } from './shared/repository-utils';
// Import Types
import type { DbClient } from '../types/shared/common.type';

/* -------------------------------------- Functions -------------------------------------- */

// Function query config หนึ่ง record เพื่อตรวจว่าเชื่อมต่อ database ได้
async function pingDatabase(connection?: DbClient): Promise<void> {
  await client(connection).appConfig.findFirst({ select: { key: true } });
}

export { pingDatabase };
