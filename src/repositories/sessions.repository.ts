// Import Library
import type { AuthSession, Prisma } from '@prisma/client';
// Import Config
import { prisma } from '../db/prisma';
// Import Types
import type { DbClient } from '../types/shared/common.type';

/* -------------------------------------- Helpers -------------------------------------- */

// Function เลือก prisma client ปกติ หรือ transaction client ที่ส่งเข้ามา
function client(connection?: DbClient): DbClient {
  return connection ?? prisma;
}

/* -------------------------------------- Functions -------------------------------------- */

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

// Function revoke ทุก session ที่ยังใช้งานได้ของ user (ยกเว้น session ที่ระบุ)
async function revokeUserSessions(userId: string, { exceptSessionId = null }: { exceptSessionId?: string | null } = {}, connection?: DbClient): Promise<number> {
  const result = await client(connection).authSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export { createSession, findSessionById, revokeUserSessions, rotateSessionRefreshToken, updateSession };
