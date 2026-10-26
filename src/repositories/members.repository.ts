// Import Library
import type { Prisma } from '@prisma/client';
// Import Repositories
import { SAFE_USER_SELECT, toUserApi } from './shared/user.repository';
import { client } from './shared/repository-utils';
// Import Types
import type { DbClient } from '../types/shared/common.type';
import type { UserApi, UserPatch } from '../types/shared/user.type';

/* -------------------------------------- Config -------------------------------------- */

// Config field ที่แก้ไขได้ผ่าน updateUser
const UPDATABLE_USER_FIELDS: (keyof UserPatch)[] = ['username', 'name', 'email', 'phone', 'role', 'permissions', 'status', 'passwordHash'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function สร้าง Prisma where สำหรับค้นหา user จาก keyword
function buildKeywordFilter(keyword: unknown): Prisma.UserWhereInput | undefined {
  if (!keyword) return undefined;
  const contains = String(keyword);
  return {
    OR: [
      { name: { contains, mode: 'insensitive' } },
      { email: { contains, mode: 'insensitive' } },
      { username: { contains, mode: 'insensitive' } },
      { role: { contains, mode: 'insensitive' } },
    ],
  };
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึง user ทั้งหมดเรียงจากสร้างล่าสุด พร้อมค้นหาจาก keyword
async function listUsers({ keyword }: { keyword?: unknown } = {}, connection?: DbClient): Promise<UserApi[]> {
  const rows = await client(connection).user.findMany({
    where: buildKeywordFilter(keyword),
    orderBy: { createdAt: 'desc' },
    select: SAFE_USER_SELECT,
  });
  return rows.map((row) => toUserApi(row));
}

// Function ตรวจว่ามี user อื่นใช้ username นี้แล้วหรือยัง
async function isUsernameTaken(username: string, { excludeId }: { excludeId?: string } = {}, connection?: DbClient): Promise<boolean> {
  if (!username) return false;

  const user = await client(connection).user.findFirst({
    where: { username, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return Boolean(user);
}

// Function สร้าง user ใหม่
async function createUser(data: Prisma.UserCreateInput, connection?: DbClient): Promise<UserApi> {
  return toUserApi(await client(connection).user.create({ data, select: SAFE_USER_SELECT }));
}

// Function แก้ไข user ด้วย id เฉพาะ field ที่อนุญาตและมีค่า
async function updateUser(id: string, patch: UserPatch = {}, connection?: DbClient): Promise<UserApi> {
  const data: Prisma.UserUpdateInput = {};
  UPDATABLE_USER_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== undefined) Object.assign(data, { [field]: patch[field] });
  });

  return toUserApi(await client(connection).user.update({ where: { id }, data, select: SAFE_USER_SELECT }));
}

// Function ลบ user ด้วย id
async function deleteUser(id: string, connection?: DbClient): Promise<UserApi> {
  return toUserApi(await client(connection).user.delete({ where: { id }, select: SAFE_USER_SELECT }));
}

// Function revoke ทุก session ที่ยังใช้งานได้ของ user (ยกเว้น session ที่ระบุ)
async function revokeUserSessions(userId: string, { exceptSessionId = null }: { exceptSessionId?: string | null } = {}, connection?: DbClient): Promise<number> {
  const result = await client(connection).authSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export { createUser, deleteUser, isUsernameTaken, listUsers, revokeUserSessions, updateUser };
