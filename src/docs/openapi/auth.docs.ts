// Import Docs
import { bearer403, body, error, ok, publicRoute, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Auth
const paths = {
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login',
      description: 'Returns token (access, send as Authorization: Bearer) and refreshToken in the body. The API sets no cookies.',
      security: publicRoute,
      requestBody: body(ref('LoginRequest')),
      responses: { 200: ok('Login success', ref('LoginResponse')), 400: error('username and password are required'), 401: error('Invalid username or password'), 429: error('Too many login attempts') },
    },
  },
  '/api/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Rotates the refresh token (single use) and extends the session idle timeout by 1 hour, never past sessionExpiresAt. Reusing an old refresh token revokes the session. 401 SESSION_EXPIRED when the session is idle for more than 1 hour, reached sessionExpiresAt, or was revoked. A token resent within 30 seconds of a rotation (another tab just refreshed) gets 401 INVALID_REFRESH_TOKEN without revoking the session.',
      security: publicRoute,
      requestBody: body(ref('RefreshRequest')),
      responses: { 200: ok('Token refreshed', ref('LoginResponse')), 401: error('Invalid refresh token or expired session') },
    },
  },
  '/api/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout current session',
      description: 'Identifies the session from the access token (Authorization: Bearer) or, when it expired, from refreshToken in the body. Revokes the session, and disconnects its Socket.IO /admin connections after sending session:revoked { reason: logout }. Always returns 200, even without a usable token.',
      security: publicRoute,
      responses: { 200: ok('Logged out') },
    },
  },
  '/api/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current user from access token',
      responses: { 200: ok('Current user', { type: 'object', properties: { user: ref('User') } }), ...bearer403 },
    },
  },

};

export default paths;
