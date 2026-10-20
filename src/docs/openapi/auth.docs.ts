// Import Docs
import { bearer403, body, error, ok, publicRoute, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Auth
const paths = {
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login',
      description: 'Bearer mode (no Origin header): returns token and refreshToken in the body. Cookie mode (Origin in ADMIN_ORIGINS): sets __Host-cp_access (Path=/) and __Secure-cp_refresh (Path=/api/auth), both HttpOnly; Secure; SameSite=Strict without Domain, and returns { user, expiresIn, refreshExpiresIn, sessionExpiresAt } without tokens. rememberMe=true gives the cookies Max-Age; otherwise they are session cookies. An Origin outside ADMIN_ORIGINS returns 403 CSRF_REJECTED.',
      security: publicRoute,
      requestBody: body(ref('LoginRequest')),
      responses: { 200: ok('Login success', ref('LoginResponse')), 400: error('username and password are required'), 401: error('Invalid username or password'), 429: error('Too many login attempts') },
    },
  },
  '/api/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Rotates the refresh token (single use) and extends the session idle timeout by 1 hour, never past sessionExpiresAt. Reusing an old refresh token revokes the session. 401 SESSION_EXPIRED when the session is idle for more than 1 hour, reached sessionExpiresAt, or was revoked. Cookie mode (Origin in ADMIN_ORIGINS) reads the refresh cookie (no body), sets new cookies with the rememberMe of the session, and returns the response without tokens; a 401 clears the cookies except INVALID_REFRESH_TOKEN for a token resent within 30 seconds of a rotation (another tab just refreshed).',
      security: publicRoute,
      requestBody: body(ref('RefreshRequest')),
      responses: { 200: ok('Token refreshed', ref('LoginResponse')), 401: error('Invalid refresh token or expired session') },
    },
  },
  '/api/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout current session',
      description: 'Identifies the session from the access token (Bearer or cookie) or, when it expired, from the refresh token (cookie, or body refreshToken in Bearer mode). Revokes the session, sends session_revoked logout to SSE, and closes payment WebSockets with 4401 logout. Always returns 200 and, in cookie mode, clears both cookies, even without a usable token.',
      security: publicRoute,
      responses: { 200: ok('Logged out'), 403: error('CSRF_REJECTED') },
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
