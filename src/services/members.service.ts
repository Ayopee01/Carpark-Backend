// Import Repositories
import * as sessionsRepository from '../repositories/sessions.repository';
import * as usersRepository from '../repositories/users.repository';
// Import Types
import type { MemberApi, MemberInput, MemberListMeta } from '../types/members.type';
import type { Actor, UserApi, UserPatch } from '../types/shared/user.type';
// Import Validation
import { memberBodySchema } from '../validation/members.schema';
import { parseWithSchema } from '../validation/zod';
// Import Utils
import { ApiError } from '../utils/api-error';
import { emitSessionRevoked } from '../utils/events';
import { createId } from '../utils/id';
import { hashPassword } from '../utils/crypto';

/* -------------------------------------- Config -------------------------------------- */

// Config permissions เริ่มต้นของ member ใหม่เมื่อไม่ได้ส่งมา
const DEFAULT_MEMBER_PERMISSIONS: string[] = ['dashboard', 'transactions'];

// Config role ที่จัดการได้เฉพาะ super admin ด้วยกัน
const SUPER_ADMIN_ROLE = 'super_admin';

/* -------------------------------------- Helpers -------------------------------------- */

// Function แยกชื่อเต็มเป็น firstName และ lastName
function splitName(name = ''): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = String(name).trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
}

// Function แปลง user เป็นรูปแบบ member API
function toMemberApi(row: UserApi): MemberApi {
  const names = splitName(row.name);
  return {
    id: row.id,
    username: row.username,
    firstName: names.firstName,
    lastName: names.lastName,
    email: row.email,
    phone: row.phone || '',
    role: row.role,
    status: row.status,
    permissions: row.permissions || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Function ดึง user ทั้งหมดยกเว้น role system
async function listVisibleUsers(filters: { keyword?: unknown } = {}): Promise<UserApi[]> {
  return (await usersRepository.listUsers(filters)).filter((user) => user.role !== 'system');
}

// Function หา user ที่ต้องมีอยู่ ถ้าไม่พบ throw MEMBER_NOT_FOUND
async function requireUser(id: string): Promise<UserApi> {
  const user = await usersRepository.findUserById(id);
  if (!user) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found');
  return user;
}

// Function ตรวจว่า username ยังไม่มีคนใช้
async function assertUsernameAvailable(username: string, excludeId?: string): Promise<void> {
  if (await usersRepository.isUsernameTaken(username, { excludeId })) {
    throw new ApiError(409, 'USERNAME_TAKEN', 'Username already exists');
  }
}

// Function ตรวจว่า actor ให้ permission ได้ไม่เกินที่ตัวเองมี (กัน settings ยกระดับสิทธิ์ตัวเองหรือคนอื่น)
function assertGrantablePermissions(actor: UserApi | null | undefined, permissions: string[] | undefined): void {
  if (!Array.isArray(permissions)) return;
  const owned = new Set(actor?.permissions || []);
  const notOwned = permissions.filter((permission) => !owned.has(permission));
  if (notOwned.length) {
    throw new ApiError(403, 'PERMISSION_NOT_GRANTABLE', 'Cannot grant permissions you do not have', { permissions: notOwned });
  }
}

// Function ตรวจว่าการแตะบัญชีหรือ role super_admin ทำได้เฉพาะ super admin
function assertSuperAdminAccess(actor: UserApi | null | undefined, target: UserApi | null, nextRole?: string): void {
  const touchesSuperAdmin = target?.role === SUPER_ADMIN_ROLE || nextRole === SUPER_ADMIN_ROLE;
  if (touchesSuperAdmin && actor?.role !== SUPER_ADMIN_ROLE) {
    throw new ApiError(403, 'SUPER_ADMIN_REQUIRED', 'Only super admin can manage super admin accounts');
  }
}

// Function ตรวจว่าจะไม่ลบ/ปิด/ลด role ของ super admin ที่ active คนสุดท้าย
async function assertNotLastSuperAdmin(target: UserApi, { nextRole = target.role, nextStatus = target.status, deleting = false }: { nextRole?: string; nextStatus?: string; deleting?: boolean } = {}): Promise<void> {
  const isActiveSuperAdmin = target.role === SUPER_ADMIN_ROLE && target.status === 'active';
  const staysActiveSuperAdmin = !deleting && nextRole === SUPER_ADMIN_ROLE && nextStatus === 'active';
  if (!isActiveSuperAdmin || staysActiveSuperAdmin) return;

  const activeSuperAdmins = (await usersRepository.listUsers()).filter((user) => user.role === SUPER_ADMIN_ROLE && user.status === 'active');
  if (activeSuperAdmins.length <= 1) throw new ApiError(409, 'LAST_SUPER_ADMIN', 'Cannot remove the last active super admin');
}

// Function แก้ไข user จาก body ที่ parse แล้ว (เปลี่ยน password จะ revoke session อื่นของ user นั้น)
async function applyMemberUpdate(id: string, data: MemberInput, { sessionId = null }: { sessionId?: string | null } = {}): Promise<MemberApi> {
  const name = data.name || (data.firstName || data.lastName ? `${data.firstName || ''} ${data.lastName || ''}`.trim() : undefined);
  const { password, firstName: _firstName, lastName: _lastName, ...fields } = data;
  const patch: UserPatch = { ...fields, name: name || undefined };
  if (password) patch.passwordHash = await hashPassword(password);

  const member = toMemberApi(await usersRepository.updateUser(id, patch));
  if (password) {
    // คนเปลี่ยนรหัสของตัวเองยังอยู่ใน session ปัจจุบันได้ ส่วน session อื่นต้อง login ใหม่ด้วยรหัสใหม่
    await sessionsRepository.revokeUserSessions(id, { exceptSessionId: sessionId });
    if (!sessionId) emitSessionRevoked({ userId: id, reason: 'password_changed' });
  }
  return member;
}

/* -------------------------------------- Functions -------------------------------------- */

// Function ดึงรายการ member พร้อม filter keyword, status และ role (meta.total = จำนวนหลัง filter ส่วนสถิติอื่นนับจาก member ทั้งหมด)
async function listMembers({ keyword, status, role }: { keyword?: string; status?: string; role?: string } = {}): Promise<{ data: MemberApi[]; meta: MemberListMeta }> {
  const all = await listVisibleUsers();
  let rows = keyword ? await listVisibleUsers({ keyword }) : all;
  if (status) rows = rows.filter((row) => row.status === status);
  if (role) rows = rows.filter((row) => row.role === role);
  return {
    data: rows.map((row) => toMemberApi(row)),
    meta: {
      total: rows.length,
      totalMembers: all.length,
      activeMembers: all.filter((user) => user.status === 'active').length,
      totalAdmins: all.filter((user) => user.role === SUPER_ADMIN_ROLE).length,
    },
  };
}

// Function สร้าง member ใหม่ (username ใช้จาก email ได้ถ้าไม่ส่งมา และให้ permission ได้ไม่เกินของผู้สร้าง)
async function createMember(body: unknown, actor?: UserApi | null): Promise<MemberApi> {
  const data: MemberInput = parseWithSchema(memberBodySchema, body);
  assertSuperAdminAccess(actor, null, data.role);
  assertGrantablePermissions(actor, data.permissions || DEFAULT_MEMBER_PERMISSIONS);
  const username = data.username || data.email?.split('@')[0];
  const name = data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim();
  if (!username) throw new ApiError(400, 'USERNAME_REQUIRED', 'username or email is required');
  if (!data.password) throw new ApiError(400, 'PASSWORD_REQUIRED', 'password is required');
  if (!name) throw new ApiError(400, 'NAME_REQUIRED', 'name, firstName, or lastName is required');
  await assertUsernameAvailable(username);

  const user = await usersRepository.createUser({
    id: createId('u'),
    username,
    passwordHash: await hashPassword(data.password),
    name,
    email: data.email || null,
    phone: data.phone || null,
    role: data.role || 'staff',
    permissions: data.permissions || DEFAULT_MEMBER_PERMISSIONS,
    status: data.status || 'active',
  });

  return toMemberApi(user);
}

// Function แก้ไขข้อมูล member ด้วย id (actor คือ user ที่ login และ sessionId ของ actor)
async function updateMember(id: string, body: unknown, { user: actor, sessionId }: Actor = {}): Promise<MemberApi> {
  const data: MemberInput = parseWithSchema(memberBodySchema, body);
  const existing = await requireUser(id);
  const isSelf = actor?.id === id;
  assertSuperAdminAccess(actor, existing, data.role);
  assertGrantablePermissions(actor, data.permissions);
  if (isSelf && data.status && data.status !== 'active') throw new ApiError(409, 'CANNOT_DISABLE_SELF', 'Cannot disable your own account');
  await assertNotLastSuperAdmin(existing, { nextRole: data.role || existing.role, nextStatus: data.status || existing.status });
  if (data.username && data.username !== existing.username) await assertUsernameAvailable(data.username, id);

  const member = await applyMemberUpdate(id, data, { sessionId: isSelf ? sessionId : null });
  if (data.status && data.status !== 'active') emitSessionRevoked({ userId: id, reason: 'user_disabled' });
  return member;
}

// Function ลบ member ด้วย id (ห้ามลบตัวเองและ super admin คนสุดท้าย)
async function deleteMember(id: string, { user: actor }: Actor = {}): Promise<{ message: string }> {
  const existing = await requireUser(id);
  if (actor?.id === id) throw new ApiError(409, 'CANNOT_DELETE_SELF', 'Cannot delete your own account');
  assertSuperAdminAccess(actor, existing);
  await assertNotLastSuperAdmin(existing, { deleting: true });
  await usersRepository.deleteUser(id);
  emitSessionRevoked({ userId: id, reason: 'user_deleted' });
  return { message: 'Member deleted successfully' };
}

export { createMember, deleteMember, listMembers, updateMember };
