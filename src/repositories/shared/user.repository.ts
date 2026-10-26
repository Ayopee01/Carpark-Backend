// Import Library
import type { Prisma } from '@prisma/client';
// Import Repositories
import { client } from './repository-utils';
// Import Types
import type { DbClient } from '../../types/shared/common.type';
import type { SafeUserRow, UserApi } from '../../types/shared/user.type';

/* -------------------------------------- Config -------------------------------------- */

// Config field ของ user ที่ query ได้โดยไม่มี passwordHash
const SAFE_USER_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  permissions: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลง user record เป็นรูปแบบ API โดยไม่มี passwordHash
function toUserApi(row: SafeUserRow): UserApi;
function toUserApi(row: SafeUserRow | null): UserApi | null;
function toUserApi(row: SafeUserRow | null): UserApi | null {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role,
    permissions: row.permissions || [],
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Function หา user ด้วย id
async function findUserById(id: string | null | undefined, connection?: DbClient): Promise<UserApi | null> {
  if (!id) return null;
  return toUserApi(await client(connection).user.findUnique({ where: { id }, select: SAFE_USER_SELECT }));
}

export { findUserById, SAFE_USER_SELECT, toUserApi };
