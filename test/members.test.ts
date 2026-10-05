// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
// Import Test Helpers
import { fixture, stub } from './support/mock';
// Import Repositories
import * as sessionsRepository from '../src/repositories/sessions.repository';
import * as usersRepository from '../src/repositories/users.repository';
// Import Services
import * as membersService from '../src/services/members.service';
// Import Types
import type { UserApi } from '../src/types/shared/user.type';

/* -------------------------------------- Test Helpers -------------------------------------- */

// Function mock users repository ด้วย user ใน memory แล้วคืน Map ของ user และรายการ session ที่ถูก revoke
function mockUsers(t: TestContext, users: UserApi[]): { store: Map<string, UserApi>; revoked: { userId: string; exceptSessionId?: string | null }[] } {
  const store = new Map(users.map((user) => [user.id, { ...user }]));
  const revoked: { userId: string; exceptSessionId?: string | null }[] = [];
  stub(t, usersRepository, { findUserById: async (id) => store.get(id ?? '') || null });
  stub(t, usersRepository, { listUsers: async () => [...store.values()] });
  stub(t, usersRepository, { isUsernameTaken: async () => false });
  stub(t, usersRepository, { createUser: async (data) => data });
  stub(t, usersRepository, { updateUser: async (id, patch) => store.set(id, fixture<UserApi>({ ...store.get(id), ...patch })).get(id) });
  stub(t, usersRepository, { deleteUser: async (id) => store.delete(id) });
  stub(t, sessionsRepository, { revokeUserSessions: async (userId, options) => revoked.push({ userId, ...options }) });
  return { store, revoked };
}

// Config user ตั้งต้น: staff ที่มีแค่ settings และ super admin คนเดียว
const STAFF = fixture<UserApi>({ id: 'u_staff', username: 'staff', name: 'Staff', role: 'staff', status: 'active', permissions: ['settings', 'dashboard'] });
const SUPER_ADMIN = fixture<UserApi>({ id: 'u_super', username: 'super', name: 'Super', role: 'super_admin', status: 'active', permissions: ['settings', 'dashboard', 'transactions', 'pricing'] });

/* -------------------------------------- Tests -------------------------------------- */

test('settings staff cannot grant permissions they do not have', async (t) => {
  mockUsers(t, [STAFF, SUPER_ADMIN]);

  await assert.rejects(
    membersService.updateMember('u_staff', { permissions: ['settings', 'pricing'] }, { user: STAFF }),
    { statusCode: 403, code: 'PERMISSION_NOT_GRANTABLE' },
  );
  await assert.rejects(
    membersService.createMember({ username: 'new', password: 'x', name: 'New', permissions: ['transactions'] }, STAFF),
    { statusCode: 403, code: 'PERMISSION_NOT_GRANTABLE' },
  );
});

test('only super admin can manage super admin accounts', async (t) => {
  mockUsers(t, [STAFF, SUPER_ADMIN]);

  await assert.rejects(membersService.updateMember('u_super', { password: 'hijack' }, { user: STAFF }), { statusCode: 403, code: 'SUPER_ADMIN_REQUIRED' });
  await assert.rejects(membersService.updateMember('u_staff', { role: 'super_admin' }, { user: STAFF }), { statusCode: 403, code: 'SUPER_ADMIN_REQUIRED' });
});

test('the last active super admin and your own account cannot be removed', async (t) => {
  mockUsers(t, [STAFF, SUPER_ADMIN]);
  const otherSuper = { ...SUPER_ADMIN, id: 'u_super_2' };

  await assert.rejects(membersService.deleteMember('u_super', { user: otherSuper }), { statusCode: 409, code: 'LAST_SUPER_ADMIN' });
  await assert.rejects(membersService.deleteMember('u_super', { user: SUPER_ADMIN }), { statusCode: 409, code: 'CANNOT_DELETE_SELF' });
});

test('changing a password revokes the other sessions of that user', async (t) => {
  const { revoked } = mockUsers(t, [STAFF, SUPER_ADMIN]);

  // Admin เปลี่ยนรหัสให้คนอื่น: revoke ทุก session ของคนนั้น
  await membersService.updateMember('u_staff', { password: 'new-secret' }, { user: SUPER_ADMIN, sessionId: 'sess_super' });
  // เปลี่ยนรหัสตัวเอง: เก็บ session ปัจจุบันไว้
  await membersService.updateMember('u_staff', { password: 'newer-secret' }, { user: STAFF, sessionId: 'sess_staff' });

  assert.deepEqual(revoked, [
    { userId: 'u_staff', exceptSessionId: null },
    { userId: 'u_staff', exceptSessionId: 'sess_staff' },
  ]);
});
