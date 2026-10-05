// Import Docs
import { bearer403, body, error, idParam, ok, query, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Members
const paths = {
  '/api/members': {
    get: {
      tags: ['Members'],
      summary: 'List members',
      description: 'Requires permission: settings. Returns { data: [member], meta: { total, totalMembers, activeMembers, totalAdmins } }. meta.total is the number of members after the keyword/status/role filters; totalMembers, activeMembers, and totalAdmins (active + inactive super_admin) count every member and ignore the filters, so the stats cards do not need another request.',
      parameters: [
        query('keyword', { type: 'string' }, 'cashier'),
        query('status', { type: 'string' }, 'active'),
        query('role', { type: 'string' }, 'staff'),
      ],
      responses: {
        200: ok('Members list', {
          type: 'object',
          properties: {
            data: { type: 'array', items: ref('AnyObject') },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 3 },
                totalMembers: { type: 'integer', example: 5 },
                activeMembers: { type: 'integer', example: 4 },
                totalAdmins: { type: 'integer', example: 1 },
              },
            },
          },
        }),
        ...bearer403,
      },
    },
    post: {
      tags: ['Members'],
      summary: 'Create member',
      description: 'Requires permission: settings. Permissions granted must be a subset of the permissions of the caller (403 PERMISSION_NOT_GRANTABLE). Only a super_admin can create, change, or delete a super_admin account or assign role super_admin (403 SUPER_ADMIN_REQUIRED).',
      requestBody: body(ref('MemberCreateRequest')),
      responses: { 201: ok('Member created'), 400: error('Invalid member payload'), ...bearer403 },
    },
  },
  '/api/members/{id}': {
    patch: {
      tags: ['Members'],
      summary: 'Update member',
      description: 'Requires permission: settings. Permissions granted must be a subset of the permissions of the caller (403 PERMISSION_NOT_GRANTABLE). Only a super_admin can create, change, or delete a super_admin account or assign role super_admin (403 SUPER_ADMIN_REQUIRED). You cannot disable your own account (409 CANNOT_DISABLE_SELF) or demote/disable the last active super_admin (409 LAST_SUPER_ADMIN). Changing password revokes the other sessions of that user. Send only the fields to change, for example { permissions: [...] } to change permissions.',
      parameters: [idParam('id', 'm_123')],
      requestBody: body(ref('UserUpdateRequest')),
      responses: { 200: ok('Member updated'), 404: error('Member not found'), 409: error('CANNOT_DISABLE_SELF or LAST_SUPER_ADMIN'), ...bearer403 },
    },
    delete: {
      tags: ['Members'],
      summary: 'Delete member',
      description: 'Requires permission: settings. Permissions granted must be a subset of the permissions of the caller (403 PERMISSION_NOT_GRANTABLE). Only a super_admin can create, change, or delete a super_admin account or assign role super_admin (403 SUPER_ADMIN_REQUIRED). You cannot delete your own account (409 CANNOT_DELETE_SELF) or the last active super_admin (409 LAST_SUPER_ADMIN).',
      parameters: [idParam('id', 'm_123')],
      responses: { 200: ok('Member deleted'), 404: error('Member not found'), 409: error('CANNOT_DELETE_SELF or LAST_SUPER_ADMIN'), ...bearer403 },
    },
  },

};

export default paths;
