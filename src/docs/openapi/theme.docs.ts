// Import Docs
import { bearer403, body, configWriteResponses, ok, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Theme
const paths = {
  '/api/theme': {
    get: {
      tags: ['Theme'],
      summary: 'Get theme settings with meta',
      description: 'Requires permission: theme.',
      responses: { 200: ok('Theme settings'), ...bearer403 },
    },
    put: {
      tags: ['Theme'],
      summary: 'Update theme settings',
      description: 'Requires permission: theme. logoUrl accepts only null or an /uploads/<file> path returned by POST /api/theme/logo (other values return 400 VALIDATION_ERROR with field logoUrl). Omit logoUrl to keep the current logo; upload and delete the logo through /api/theme/logo.',
      requestBody: body(ref('ThemeUpdateRequest')),
      responses: { 200: ok('Theme updated'), ...configWriteResponses },
    },
  },
  '/api/theme/logo': {
    post: {
      tags: ['Theme'],
      summary: 'Upload logo file',
      description: 'Requires permission: theme. Accepts jpg, png, or webp files up to 2MB in field logo. SVG is rejected. The backend checks the extension, the mimetype, and the file content (magic bytes must match the extension); a failed check deletes the file and keeps the current logo. Errors: 400 LOGO_FILE_REQUIRED (no file), 400 INVALID_LOGO_FILE (wrong type, File too large, Unexpected field, or content that does not match a jpg, png or webp image).',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['logo'],
              properties: {
                logo: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
      responses: { 200: ok('Logo uploaded'), ...configWriteResponses },
    },
    delete: {
      tags: ['Theme'],
      summary: 'Delete logo and reset logoUrl',
      description: 'Requires permission: theme.',
      responses: { 200: ok('Logo deleted'), ...configWriteResponses },
    },
  },

};

export default paths;
