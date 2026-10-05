// Import Docs
import { bearer403, body, error, idParam, json, ok, publicRoute, query, ref } from './helpers';

/* -------------------------------------- Paths -------------------------------------- */

// Config OpenAPI paths ของ tag Devices
const paths = {
  '/api/devices/events': {
    get: {
      tags: ['Devices'],
      summary: 'Admin Server-Sent Events stream for device updates',
      description: 'Requires permission: devices. Sends devices_snapshot { data } on every connect (data has the same shape as GET /api/devices without filters), then realtime device status/config updates such as device_provisioned, device_activation_reissued, device_status_changed, device_deleted, and devices_config_updated. Admin Frontend should use this stream with GET /api/devices?deviceType=camera to show online LPR cameras before saving Barrier Gate cameraIds. Admin streams send session_revoked { reason } and close when the session is logged out, revoked, expired, or the user is disabled/deleted. Refreshing the access token does not require reopening the stream.',
      responses: { 200: { description: 'SSE stream' }, ...bearer403 },
    },
  },
  '/api/client/config': {
    get: {
      tags: ['Devices'],
      summary: 'Get public base client config',
      description: 'Public config endpoint for every client before activation/login. No token, deviceId, or device credentials are required. Returns only the base theme config used by mobile, kiosk, and barrier gate frontends.',
      security: publicRoute,
      responses: {
        200: ok('Client theme config', {
          type: 'object',
          properties: {
            theme: {
              type: 'object',
              properties: {
                systemName: { type: 'string', nullable: true, example: 'Smart Carpark' },
                themeColor: { type: 'string', nullable: true, example: '#FFD54F' },
                logoUrl: { type: 'string', nullable: true, example: '/uploads/logo-1779640171113-ef251ff8b38970bb.png' },
                themeMode: { type: 'string', example: 'theme1' },
                customThemeColor: { type: 'string', nullable: true, example: '#000000' },
                updatedAt: { type: 'string', nullable: true, example: '2026-05-24T16:42:59.056Z' },
              },
            },
          },
        }),
      },
    },
  },
  '/api/devices': {
    get: {
      tags: ['Devices'],
      summary: 'List devices',
      description: 'Requires permission: devices. Unified list for kiosks, barrier gates, and other devices. Use query filters instead of separate kiosk/barrier-gate endpoints.',
      parameters: [
        query('deviceType', { type: 'string', enum: ['kiosk', 'barrier_gate', 'camera', 'printer', 'edc'] }, 'kiosk'),
        query('status', { type: 'string', enum: ['pending_activation', 'active', 'offline', 'maintenance'] }, 'active'),
        query('keyword', { type: 'string' }, 'KIOSK-A'),
      ],
      responses: { 200: ok('Devices list'), ...bearer403 },
    },
    post: {
      tags: ['Devices'],
      summary: 'Create a device of any type',
      description: 'Requires permission: devices. One create endpoint for every device type; deviceType decides what is created and the response shape. kiosk / barrier_gate: creates a device waiting for activation and returns DeviceActivationCodeCreateResponse (CodeActivate). Kiosk and barrier gate may include printerIds and edcDeviceId; barrier gate may also include gateId, direction, and cameraIds (cameras do not need to be online at save time). cameraIds must be deviceIds of registered cameras and printerIds of registered printers; otherwise 400 INVALID_DEVICE_MAPPING with field and invalidIds. deviceName is trimmed and must not be empty. allowedIps errors use field allowedIps.<index>. camera / printer: creates an active credentialed device and returns { success, message, device, deviceToken }; deviceToken is shown only once, store it in the LPR middleware/printer service. edc: registers an EDC terminal (terminalId required and unique, 409 EDC_TERMINAL_ID_EXISTS; usage cashier or device) and returns { success, message, device } without a token. A missing or unknown deviceType returns 400 VALIDATION_ERROR.',
      requestBody: body(ref('DeviceActivationCodeCreateRequest'), { deviceName: 'Exit Barrier Gate 1', deviceType: 'barrier_gate', gateId: 'GATE-A', direction: 'OUT', cameraIds: ['CAM-OUT-A'], printerIds: ['PRN-GATE-A'] }),
      responses: {
        201: ok('Device created (shape depends on deviceType)', { oneOf: [ref('DeviceActivationCodeCreateResponse'), ref('CameraProvisionResponse'), ref('PrinterProvisionResponse'), ref('DeviceMutationResponse')] }),
        400: { description: 'Invalid request, EDC_TERMINAL_ID_REQUIRED, or EDC binding error', content: json(ref('ActivationErrorResponse')) },
        409: { description: 'DEVICE_CODE_EXISTS or EDC_TERMINAL_ID_EXISTS', content: json(ref('ActivationErrorResponse')) },
        ...bearer403,
      },
    },
  },
  '/api/devices/{deviceId}': {
    put: {
      tags: ['Devices'],
      summary: 'Update device by id, deviceId, or deviceCode',
      description: 'Requires permission: devices. Works for kiosk, barrier_gate, and other device records. deviceType cannot be changed because the device token belongs to the original type (400 DEVICE_TYPE_IMMUTABLE). Kiosk/Barrier Gate bind an EDC with edcDeviceId (EDC must have usage device and not be bound elsewhere: 400 EDC_DEVICE_NOT_FOUND / EDC_USAGE_INVALID / EDC_OWNER_INVALID, 409 EDC_DEVICE_IN_USE). EDC devices update terminalId (unique, 409 EDC_TERMINAL_ID_EXISTS), merchantId, provider, serialNo, and usage. cameraIds must be deviceIds of registered cameras and printerIds of registered printers (cameras do not need to be online); otherwise 400 INVALID_DEVICE_MAPPING with field and invalidIds. deviceName is trimmed and must not be empty. allowedIps errors use field allowedIps.<index>. deviceName/name cannot be null or blank on update. A camera can be mapped to one barrier gate only: 409 CAMERA_IN_USE with cameraIds and assignedTo [{ cameraId, deviceId }]; remove it from the old gate first (saving the same gate with the same camera is allowed).',
      parameters: [idParam('deviceId', 'K-20260524-001')],
      requestBody: body(ref('DeviceUpdateRequest'), { deviceName: 'Kiosk A', location: 'Main Lobby', status: 'maintenance' }),
      responses: { 200: ok('Device updated', ref('DeviceMutationResponse')), 400: error('DEVICE_TYPE_IMMUTABLE or validation error'), 404: error('Device not found'), ...bearer403 },
    },
    delete: {
      tags: ['Devices'],
      summary: 'Delete device by id, deviceId, or deviceCode',
      description: 'Requires permission: devices. Works for kiosk, barrier_gate, and other device records. The deleted deviceId is also removed from cameraIds/printerIds of every other device, and an open client SSE of the deleted device is closed with device_revoked.',
      parameters: [idParam('deviceId', 'K-20260524-001')],
      responses: { 200: ok('Device deleted', ref('DeleteSuccessResponse')), 404: error('Device not found'), ...bearer403 },
    },
  },
  '/api/devices/{deviceId}/cameras/{cameraId}': {
    put: {
      tags: ['Devices'],
      summary: 'Map one camera to a barrier gate',
      description: 'Requires permission: devices. Adds one camera without sending the whole cameraIds list. Barrier gates only (400 DEVICE_MAPPING_NOT_SUPPORTED). The camera must be a registered camera (400 INVALID_DEVICE_MAPPING) and not mapped to another gate (409 CAMERA_IN_USE with assignedTo). Mapping an already mapped camera returns 200. The new list is computed inside the devices config lock, so concurrent changes to other cameras are kept.',
      parameters: [idParam('deviceId', 'GATE-A'), idParam('cameraId', 'CAM-1')],
      responses: { 200: ok('Device mapped'), 400: error('DEVICE_MAPPING_NOT_SUPPORTED or INVALID_DEVICE_MAPPING'), 404: error('DEVICE_NOT_FOUND'), 409: error('CAMERA_IN_USE'), ...bearer403 },
    },
    delete: {
      tags: ['Devices'],
      summary: 'Unmap one camera from a barrier gate',
      description: 'Requires permission: devices. Removes one camera id from cameraIds. Unmapping an id that is not mapped returns 200; the camera does not need to exist, so stale ids can be removed.',
      parameters: [idParam('deviceId', 'GATE-A'), idParam('cameraId', 'CAM-1')],
      responses: { 200: ok('Device unmapped'), 400: error('DEVICE_MAPPING_NOT_SUPPORTED'), 404: error('DEVICE_NOT_FOUND'), ...bearer403 },
    },
  },
  '/api/devices/{deviceId}/printers/{printerId}': {
    put: {
      tags: ['Devices'],
      summary: 'Map one printer to a kiosk or barrier gate',
      description: 'Requires permission: devices. Adds one printer without sending the whole printerIds list. Kiosks and barrier gates only (400 DEVICE_MAPPING_NOT_SUPPORTED). The printer must be a registered printer (400 INVALID_DEVICE_MAPPING); printers can be shared by several devices. Mapping an already mapped printer returns 200.',
      parameters: [idParam('deviceId', 'KIOSK-1'), idParam('printerId', 'PRN-1')],
      responses: { 200: ok('Device mapped'), 400: error('DEVICE_MAPPING_NOT_SUPPORTED or INVALID_DEVICE_MAPPING'), 404: error('DEVICE_NOT_FOUND'), ...bearer403 },
    },
    delete: {
      tags: ['Devices'],
      summary: 'Unmap one printer from a kiosk or barrier gate',
      description: 'Requires permission: devices. Removes one printer id from printerIds. Unmapping an id that is not mapped returns 200; the printer does not need to exist.',
      parameters: [idParam('deviceId', 'KIOSK-1'), idParam('printerId', 'PRN-1')],
      responses: { 200: ok('Device unmapped'), 400: error('DEVICE_MAPPING_NOT_SUPPORTED'), 404: error('DEVICE_NOT_FOUND'), ...bearer403 },
    },
  },
  '/api/devices/{deviceId}/activation-code': {
    post: {
      tags: ['Devices'],
      summary: 'Reissue activation code for an existing kiosk or barrier gate',
      description: 'Requires permission: devices. Creates a new activation code for an existing kiosk or barrier_gate without recreating the device or losing cameraIds/printerIds mappings. The previous deviceToken is invalidated; after the device frontend activates with the new code, the backend returns a new one-time deviceToken.',
      parameters: [idParam('deviceId', 'BG-20260628-001')],
      responses: {
        201: ok('Activation code reissued', {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Activation code reissued' },
            deviceId: { type: 'string', example: 'BG-20260628-001' },
            deviceName: { type: 'string', example: 'Barrier Gate OUT A' },
            deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate'], example: 'barrier_gate' },
            activationCode: { type: 'string', example: '483921' },
            expiresAt: { type: 'string', format: 'date-time' },
            device: ref('DeviceMutationResponse'),
          },
        }),
        400: error('Activation code can only be reissued for kiosk or barrier_gate devices'),
        403: error('Device is currently under maintenance'),
        404: error('Device not found'),
        ...bearer403,
      },
    },
  },

};

export default paths;
