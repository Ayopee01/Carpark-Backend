// Import Types
import type { SafeUserRow, UserApi } from '../../types/shared/user.type';

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

export { toUserApi };
