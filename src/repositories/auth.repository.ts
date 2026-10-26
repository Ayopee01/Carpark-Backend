// Import Library
import type { AuthSession, Prisma, User } from '@prisma/client';
// Import Repositories
import { client } from './shared/repository-utils';
// Import Types
import type { DbClient } from '../types/shared/common.type';

/* -------------------------------------- Functions -------------------------------------- */

// Function หา user ที่ active ตาม username พร้อม passwordHash สำหรับตรวจตอน login
async function findActiveUserWithPasswordByUsername(username: string, connection?: DbClient): Promise<User | null> {
  if (!username) return null;
  return client(connection).user.findFirst({ where: { username, status: 'active' } });
}

// Function สร้าง session ใหม่
async function createSession(data: Prisma.AuthSessionUncheckedCreateInput, connection?: DbClient): Promise<AuthSession> {
  return client(connection).authSession.create({ data });
}

// Function หา session ด้วย id
async function findSessionById(id: string | null | undefined, connection?: DbClient): Promise<AuthSession | null> {
  if (!id) return null;
  return client(connection).authSession.findUnique({ where: { id } });
}

// Function แก้ไข session ด้วย id
async function updateSession(id: string, data: Prisma.AuthSessionUncheckedUpdateInput, connection?: DbClient): Promise<AuthSession> {
  return client(connection).authSession.update({ where: { id }, data });
}

// Function เปลี่ยน refresh token hash เฉพาะเมื่อ hash เดิมยังตรงและ session ยังไม่ถูก revoke คืน true ถ้าเปลี่ยนสำเร็จ
async function rotateSessionRefreshToken(id: string, currentHash: string, data: Prisma.AuthSessionUncheckedUpdateManyInput, connection?: DbClient): Promise<boolean> {
  const result = await client(connection).authSession.updateMany({
    where: { id, refreshTokenHash: currentHash, revokedAt: null },
    data,
  });
  return result.count === 1;
}

// Function ลบ session ที่ idle หมดอายุก่อน cutoff (idleExpiresAt ไม่เกิน expiresAt จึงครอบคลุม session ที่หมดอายุและถูก revoke) คืนจำนวนที่ลบ
async function deleteSessionsIdleExpiredBefore(cutoff: Date, connection?: DbClient): Promise<number> {
  const result = await client(connection).authSession.deleteMany({ where: { idleExpiresAt: { lt: cutoff } } });
  return result.count;
}

export { createSession, deleteSessionsIdleExpiredBefore, findActiveUserWithPasswordByUsername, findSessionById, rotateSessionRefreshToken, updateSession };
