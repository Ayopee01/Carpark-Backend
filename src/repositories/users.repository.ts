// Import Library
import type { Prisma, User } from '@prisma/client';
// Import Config
import { prisma } from '../db/prisma';
// Import Mappers
import { toUserApi } from './mappers/user.mapper';
// Import Types
import type { DbClient } from '../types/shared/common.type';
import type { UserApi, UserPatch } from '../types/shared/user.type';

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

// Config field ที่แก้ไขได้ผ่าน updateUser
const UPDATABLE_USER_FIELDS: (keyof UserPatch)[] = ['username', 'name', 'email', 'phone', 'role', 'permissions', 'status', 'passwordHash'];

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือก prisma client ปกติ หรือ transaction client ที่ส่งเข้ามา
function client(connection?: DbClient): DbClient {
  return connection ?? prisma;
}

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

// Function หา user ที่ active ตาม username พร้อม passwordHash สำหรับตรวจตอน login
async function findActiveUserWithPasswordByUsername(username: string, connection?: DbClient): Promise<User | null> {
  if (!username) return null;
  return client(connection).user.findFirst({ where: { username, status: 'active' } });
}

// Function หา user ด้วย id
async function findUserById(id: string | null | undefined, connection?: DbClient): Promise<UserApi | null> {
  if (!id) return null;
  return toUserApi(await client(connection).user.findUnique({ where: { id }, select: SAFE_USER_SELECT }));
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

export { createUser, deleteUser, findActiveUserWithPasswordByUsername, findUserById, isUsernameTaken, listUsers, updateUser };
