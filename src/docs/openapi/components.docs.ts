// Import Docs
import { fromZod, ref } from './helpers';
// Import Validation
import { activateDeviceBodySchema, adminOmiseChargeInputSchema, adminPaymentBodySchema, cameraTransactionBodySchema, chargeIdInputSchema, clientEdcPaymentBodySchema, clientOmiseChargeInputSchema, createMemberBodySchema, heartbeatBodySchema, loginBodySchema, memberBodySchema, provisionDeviceBodySchema, resolveRefundBodySchema, systemSettingsBodySchema, updateChannelBodySchema, updateDeviceBodySchema, updateMethodBodySchema, updatePricingConfigBodySchema, updateThemeBodySchema, updateTransactionBodySchema } from '../../validation/schemas';

/* -------------------------------------- Components -------------------------------------- */

// Config OpenAPI components ที่หลาย tag อ้างอิงร่วมกัน (security schemes และ schemas) request schema สร้างจาก zod schema ที่ใช้ validate จริงด้วย fromZod
const components = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT (HS256)',
    },
    deviceIdHeader: {
      type: 'apiKey',
      in: 'header',
      name: 'X-Device-Id',
      description: 'Registered deviceId returned after kiosk or barrier-gate activation.',
    },
    deviceTokenHeader: {
      type: 'apiKey',
      in: 'header',
      name: 'X-Device-Token',
      description: 'Device token returned once during activation. Failed checks: 401/403 INVALID_DEVICE_CREDENTIALS with reason not_found, invalid_type, invalid_token (counted as failed attempts), inactive or ip_not_allowed (token is valid, not counted; keep the token and show maintenance). After DEVICE_AUTH_RATE_LIMIT counted failures for one deviceId from one IP in a fixed 15-minute window (or 10x that for one IP across all deviceIds) the request returns 429 TOO_MANY_DEVICE_AUTH_ATTEMPTS with Retry-After (seconds) before the token is checked. Requests refused with 429 are not counted, so retrying does not extend the pause. Counters live in API memory per instance.',
    },
    deviceBearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Alternative device credential format: Device <token>.',
    },
  },
  schemas: {
    AnyObject: {
      type: 'object',
      additionalProperties: true,
    },
    ErrorResponse: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        code: { type: 'string', nullable: true, example: 'TRANSACTION_NOT_FOUND', description: 'UPPER_SNAKE_CASE error code. Omise provider errors keep the Omise error code (for example invalid_card) or null.' },
        reason: { type: 'string' },
        requiredPermission: { type: 'string' },
        errors: {
          type: 'array',
          description: 'Field-level validation errors (400 from zod request validation).',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', nullable: true, example: 'price' },
              message: { type: 'string', example: 'price must be a number greater than or equal to 0' },
            },
          },
        },
      },
    },
    SuccessMessageResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Operation completed successfully' },
      },
    },
    User: {
      type: 'object',
      description: 'Same shape in login, refresh, and GET /api/auth/me.',
      properties: {
        id: { type: 'string', example: 'u_123' },
        username: { type: 'string', example: 'admin1' },
        name: { type: 'string', example: 'Admin One' },
        email: { type: 'string', nullable: true, example: 'admin@example.com' },
        phone: { type: 'string', nullable: true, example: '0812345678' },
        role: { type: 'string', example: 'staff' },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          example: ['dashboard', 'overview', 'transactions', 'pricing', 'devices', 'theme', 'settings'],
        },
        status: { type: 'string', example: 'active' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    LoginRequest: fromZod(loginBodySchema, {
      properties: {
        username: { example: 'admin1' },
        password: { example: '123' },
        rememberMe: { example: false, description: 'Stored on the session only. The frontend decides where to keep the tokens (for example localStorage when true, sessionStorage when false).' },
      },
    }),
    LoginResponse: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: { type: 'integer', example: 3600, description: 'Access token lifetime in seconds. Refresh before it ends.' },
        refreshExpiresIn: { type: 'integer', example: 3600, description: 'Refresh token lifetime in seconds (session idle timeout). Each refresh extends it, up to sessionExpiresAt.' },
        sessionExpiresAt: { type: 'string', format: 'date-time', description: 'Absolute session end (12 hours after login). Refresh cannot extend it; the user must log in again.' },
        user: { $ref: '#/components/schemas/User' },
      },
    },
    RefreshRequest: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string' },
      },
    },
    UserUpdateRequest: fromZod(memberBodySchema, {
      properties: {
        role: { example: 'staff', description: 'Only a super_admin can assign super_admin. Access is decided by permissions.' },
        status: { example: 'active', description: 'inactive cannot log in and its sessions are revoked.' },
      },
    }),
    MemberCreateRequest: fromZod(createMemberBodySchema, {
      required: ['password'],
      properties: {
        username: { example: 'cashier1', description: 'Required when email is not supplied (400 VALIDATION_ERROR).' },
        password: { example: '123456', description: '400 VALIDATION_ERROR when missing.' },
        firstName: { example: 'Cashier' },
        lastName: { example: 'One' },
        name: { example: 'Cashier One', description: 'Required when firstName/lastName are not supplied (400 VALIDATION_ERROR).' },
        email: { example: 'cashier1@example.com' },
        phone: { example: '0812345678' },
        role: { example: 'staff', description: 'Only a super_admin can assign super_admin. Access is decided by permissions.' },
        status: { example: 'active', description: 'inactive cannot log in and its sessions are revoked.' },
        permissions: { example: ['transactions'] },
      },
    }),
    Transaction: {
      type: 'object',
      additionalProperties: true,
      properties: {
        durationHour: { type: 'number', example: 12, description: 'Billed hours (sum of hourly slots of every Bangkok day).' },
        feeBreakdown: { $ref: '#/components/schemas/FeeBreakdown' },
        id: { type: 'string', example: 't_123' },
        billNo: { type: 'string', example: 'PK20260524-120000' },
        plateNo: { type: 'string', example: '1ABC1234' },
        vehicleType: { type: 'string', enum: ['car', 'motorcycle'], example: 'car' },
        entryAt: { type: 'string', format: 'date-time' },
        exitAt: { type: 'string', format: 'date-time', nullable: true },
        status: { type: 'string', enum: ['pending', 'partially_paid', 'paid_waiting_exit', 'completed', 'cancelled'] },
        netAmount: { type: 'number', example: 40 },
        totalPaid: { type: 'number', example: 0 },
        remainingAmount: { type: 'number', example: 40 },
      },
    },
    PlateLookupCandidate: {
      type: 'object',
      properties: {
        plateNo: { type: 'string', example: '3ABC1234' },
        billNo: { type: 'string', example: 'PK20260524-120000' },
        vehicleType: { type: 'string', enum: ['car', 'motorcycle'], example: 'car' },
        status: { type: 'string', enum: ['pending', 'partially_paid', 'paid_waiting_exit', 'completed', 'cancelled'] },
        entryAt: { type: 'string', format: 'date-time' },
        exitAt: { type: 'string', format: 'date-time', nullable: true },
        exitTimeLimit: { type: 'string', format: 'date-time', nullable: true },
      },
    },
    PlateLookupMultipleResponse: {
      type: 'object',
      properties: {
        matchType: { type: 'string', example: 'multiple' },
        requiresSelection: { type: 'boolean', example: true },
        query: { type: 'string', example: '1234' },
        candidates: {
          type: 'array',
          items: ref('PlateLookupCandidate'),
        },
      },
    },
    CameraTransactionRequest: fromZod(cameraTransactionBodySchema, {
      properties: {
        plateNo: { example: '3งจ9012' },
        vehicleType: { type: 'string', enum: ['car', 'motorcycle'], default: 'car' },
        cameraId: { example: 'CAM-IN-01' },
        gateId: { type: 'string', nullable: true, example: 'GATE-A', description: 'Optional. If omitted, backend resolves it from cameraId and direction using barrier gate mapping.' },
        direction: { enum: ['IN', 'OUT'], example: 'IN' },
        capturedAt: { type: 'string', format: 'date-time', example: '2026-05-25T10:30:00+07:00' },
        imageUrl: { type: 'string', example: 'https://example.com/plate.jpg' },
      },
    }),
    TransactionUpdateRequest: fromZod(updateTransactionBodySchema, {
      description: 'Unknown fields are ignored. Date-time values without a timezone are read as Bangkok time.',
      properties: {
        plateNo: { example: '3งจ9012' },
        serviceType: { example: 'parking' },
        totalPaid: { example: 40, description: 'At most 2 decimals.' },
        exitTimeLimit: { type: 'string', format: 'date-time', nullable: true },
        exitAt: { type: 'string', format: 'date-time', nullable: true },
      },
    }),
    AdminPaymentRequest: fromZod(adminPaymentBodySchema, {
      properties: {
        plateNo: { example: '3งจ9012' },
        method: { example: 'cash', description: 'Payment method id (cash, qr, bank1, wallet, card, other). Must be active in payment_settings.methods and allowed by the cashier channel.' },
        channel: { example: 'cashier', description: 'Only cashier, admin, or ch_cashier (or omitted), all stored as cashier (400 VALIDATION_ERROR).' },
        amount: { anyOf: [{ type: 'number' }, { type: 'string' }], example: 40, description: 'Optional partial amount, must be > 0 (400 VALIDATION_ERROR) and not above the remaining amount (400 AMOUNT_EXCEEDS_REMAINING). Omitted = pay the full remaining amount.' },
        deviceId: { example: 'K-20260524-001' },
        deviceName: { example: 'Kiosk A' },
        deviceLocation: { example: 'Main Lobby' },
        reference: { example: 'APPR-123456', description: 'EDC approval code or slip number. Required when method is card (400 VALIDATION_ERROR); stored on the payment as reference. A reference (with terminalId) can be used for one transaction only (409 PAYMENT_REFERENCE_USED).' },
        edcDeviceId: { example: 'EDC-20261001-002', description: 'Cashier EDC device chosen by staff (from GET /api/payments/edc/terminals). Required when method is card (400 VALIDATION_ERROR); must be an active EDC with usage cashier (400 EDC_DEVICE_NOT_FOUND / EDC_DEVICE_NOT_CASHIER, 409 EDC_DEVICE_UNAVAILABLE). The backend stores its terminalId on the payment.' },
        confirmPendingCharge: { example: false, description: 'true = take this payment even though an Omise QR of the transaction is still payable (after 409 PENDING_GATEWAY_CHARGE).' },
      },
    }),
    ClientEdcPaymentRequest: fromZod(clientEdcPaymentBodySchema, {
      properties: {
        transactionId: { example: 't_123', description: 'Preferred. Or send plateNo (full plate, exact match).' },
        plateNo: { example: 'กข1234' },
        amount: { anyOf: [{ type: 'number' }, { type: 'string' }], example: 40, description: 'Amount charged on the EDC terminal in baht.' },
        reference: { example: 'APPR-123456', description: 'EDC approval code / slip number.' },
        terminalId: { example: 'TID-12345678', description: 'EDC terminal id from the terminal result. Must match the terminalId of the bound EDC device.' },
      },
    }),
    OmiseChargeRequest: fromZod(clientOmiseChargeInputSchema, {
      properties: {
        plateNo: { example: '3งจ9012', description: 'Must be the plate of transactionId when transactionId is sent (400 TRANSACTION_PLATE_MISMATCH).' },
        transactionId: { type: 'string', example: 't_aff4dec0-7933-48a4-a791-730b7ee8b95a', description: 'Required for mobile (no device headers, 400 TRANSACTION_ID_REQUIRED): the transactionId from GET /api/client/transactions/{id}. Kiosk/barrier gate may omit it and are looked up by plateNo.' },
        source: { type: 'string', example: 'src_test_123', description: 'Optional for PromptPay: omit it and send method promptpay to let the backend create the source (400 VALIDATION_ERROR otherwise).' },
        sourceType: { type: 'string', example: 'promptpay' },
        method: { type: 'string', example: 'promptpay', description: 'Payment method id from payment-settings. Required unless sourceType is supplied (400 VALIDATION_ERROR).' },
        token: { type: 'string', description: 'Not accepted (400 VALIDATION_ERROR). Cards use the EDC terminal.' },
        deviceId: { type: 'string', example: 'K-20260524-001' },
        returnUri: { type: 'string', example: 'https://carpark-uat.biza.me/payment/result', description: 'http or https URL only (400 VALIDATION_ERROR).' },
      },
    }),
    AdminOmiseChargeRequest: fromZod(adminOmiseChargeInputSchema, {
      properties: {
        transactionId: { type: 'string', example: 't_123', description: 'Preferred admin lookup key. Send transactionId or plateNo (400 VALIDATION_ERROR).' },
        plateNo: { type: 'string', example: '3งจ9012', description: 'Fallback lookup key when transactionId is not supplied.' },
        source: { type: 'string', example: 'src_test_123', description: 'Optional for PromptPay: omit it and send method promptpay to let the backend create the source. Other source types need an Omise.js source id (400 VALIDATION_ERROR).' },
        sourceType: { type: 'string', example: 'promptpay' },
        method: { type: 'string', example: 'promptpay', description: 'Payment method id from payment-settings. Required unless sourceType is supplied (400 VALIDATION_ERROR).' },
        token: { type: 'string', description: 'Not accepted (400 VALIDATION_ERROR). Cards use the EDC terminal.' },
        channel: { type: 'string', enum: ['cashier'], example: 'cashier', description: 'Admin Omise payments must stay cashier, including PromptPay/QR (400 VALIDATION_ERROR).' },
        amount: { type: 'integer', example: 4000, description: 'Optional minor currency amount for validation; 4000 means 40.00 THB (400 VALIDATION_ERROR, AMOUNT_MISMATCH).' },
        returnUri: { type: 'string', example: 'https://carpark-uat.biza.me/payments/result', description: 'http or https URL only (400 VALIDATION_ERROR).' },
      },
    }),
    OmiseChargeResponse: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Omise charge created' },
        clientType: { type: 'string', example: 'mobile' },
        charge: {
          type: 'object',
          properties: {
            provider: { type: 'string', example: 'omise' },
            reused: { type: 'boolean', example: false, description: 'true = the pending charge/QR of this transaction was returned instead of creating a new one.' },
            chargeId: { type: 'string', example: 'chrg_test_123' },
            status: { type: 'string', example: 'pending' },
            amount: { type: 'integer', example: 4000, description: 'Minor currency unit; 4000 means 40.00 THB.' },
            currency: { type: 'string', example: 'thb' },
            plateNo: { type: 'string', example: '3งจ9012' },
            method: { type: 'string', example: 'promptpay' },
            channel: { type: 'string', example: 'mobile' },
            authorizeUri: { type: 'string', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the QR stops being payable (PromptPay uses OMISE_QR_EXPIRY_MINUTES).' },
            qr: { type: 'object', nullable: true, additionalProperties: true },
          },
        },
      },
    },
    OmiseWebhookResponse: {
      type: 'object',
      properties: {
        received: { type: 'boolean', example: true },
        action: { type: 'string', example: 'processed', description: 'processed, refund_required (money collected but not applied; see refund list), already_processed, updated, or ignored.' },
        chargeId: { type: 'string', example: 'chrg_test_123' },
        status: { type: 'string', example: 'successful' },
      },
    },
    AdminPaymentResponse: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Payment confirmed successfully', description: 'Payment already recorded when duplicate is true.' },
        data: {
          type: 'object',
          properties: {
            duplicate: { type: 'boolean', example: false, description: 'true when this reference (with its terminalId) was already recorded on the transaction; nothing was recorded twice and payment is the saved payment of that reference.' },
            transaction: {
              type: 'object',
              properties: {
                transactionId: { type: 'string', example: 't_aff4dec0-7933-48a4-a791-730b7ee8b95a' },
                billNo: { type: 'string', example: 'PK20260525-033000-3333' },
                plateNo: { type: 'string', example: '3งจ9019' },
                vehicleType: { type: 'string', example: 'car' },
                status: { type: 'string', example: 'paid_waiting_exit' },
              },
            },
            payment: {
              type: 'object',
              properties: {
                paymentId: { type: 'string', example: 'pay_48bd0519-348f-4ae1-832a-8f15f50f534e' },
                method: { type: 'string', example: 'cash' },
                channel: { type: 'string', example: 'cashier' },
                paidAmount: { type: 'number', example: 435 },
                paidAt: { type: 'string', format: 'date-time' },
                processedBy: { type: 'string', example: 'u5' },
                reference: { type: 'string', nullable: true, example: 'APPR-123456' },
                terminalId: { type: 'string', nullable: true, example: 'TID-C1' },
                edcDeviceId: { type: 'string', nullable: true, example: 'EDC-C1' },
              },
            },
            amount: {
              type: 'object',
              properties: {
                netAmount: { type: 'number', example: 435 },
                paidAmount: { type: 'number', example: 435 },
                remainingAmount: { type: 'number', example: 0 },
              },
            },
            parking: {
              type: 'object',
              properties: {
                entryAt: { type: 'string', format: 'date-time' },
                exitTimeLimit: { type: 'string', format: 'date-time' },
                isOverstay: { type: 'boolean', example: false },
                durationDisplay: { type: 'string', example: '25-05-2026 | 32 : 18' },
                totalMinutes: { type: 'number', example: 1938 },
              },
            },
          },
        },
      },
    },
    FeeBreakdown: {
      type: 'object',
      description: 'How netAmount was calculated. Parking is split at 00:00 Asia/Bangkok; each day restarts hourly counting from base_hour, and each midnight crossed adds one overnight_day charge.',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', example: '2026-05-04' },
              hours: { type: 'number', example: 4 },
              amount: { type: 'number', example: 110 },
              ranges: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    feeType: { type: 'string', example: 'base_hour' },
                    ruleId: { type: 'string', nullable: true },
                    hourStart: { type: 'number', example: 1 },
                    hourEnd: { type: 'number', example: 3 },
                    hours: { type: 'number', example: 3 },
                    pricePerHour: { type: 'number', example: 30 },
                    amount: { type: 'number', example: 90 },
                  },
                },
              },
            },
          },
        },
        overnight: {
          type: 'object',
          nullable: true,
          properties: {
            ruleId: { type: 'string', nullable: true },
            nights: { type: 'number', example: 1 },
            pricePerNight: { type: 'number', example: 100 },
            amount: { type: 'number', example: 100 },
          },
        },
      },
    },
    PricingRule: {
      type: 'object',
      required: ['price'],
      properties: {
        id: { type: 'string', example: 'pr_123' },
        name: { type: 'string', example: 'Car first hour' },
        feeType: { type: 'string', enum: ['base_hour', 'next_hour', 'overnight_day'], description: 'base_hour = price per hour for hours 1..hourEnd of each day. next_hour = price per hour for hourStart..hourEnd (null = 24) after base_hour. overnight_day = charge per midnight crossed (Asia/Bangkok).' },
        vehicleType: { type: 'string', enum: ['car', 'motorcycle'], example: 'car' },
        price: { type: 'number', minimum: 0, example: 30, description: 'Up to 2 decimals. 0 makes the hours free.' },
        baseHours: { type: 'number', example: 3, description: 'Deprecated alias of hourEnd for base_hour.' },
        hourStart: { type: 'number', minimum: 1, maximum: 24, example: 1, description: 'base_hour always starts at 1. next_hour must start after base_hour hourEnd and ranges must not overlap.' },
        hourEnd: { type: 'number', nullable: true, minimum: 1, maximum: 24, example: 3, description: 'base_hour hourEnd 24 means no next_hour is allowed.' },
        status: { type: 'string', enum: ['active', 'inactive'], example: 'active', description: 'inactive rules are kept but not used for fees or hour range checks.' },
      },
    },
    PricingConfigResponse: {
      type: 'object',
      properties: {
        pricingRules: {
          type: 'array',
          items: ref('PricingRule'),
        },
        configUpdatedAt: { type: 'string', nullable: true, example: '2026-05-22T10:23:16.425Z' },
      },
    },
    PaymentMethodUpdateRequest: fromZod(updateMethodBodySchema, {
      properties: {
        label: { example: 'QR PromptPay' },
        isActive: { example: true },
      },
    }),
    ChannelMappingUpdateRequest: fromZod(updateChannelBodySchema, {
      properties: {
        allowedMethods: { example: ['cash', 'qr', 'wallet'] },
      },
    }),
    DeviceActivationCodeCreateRequest: fromZod(provisionDeviceBodySchema, {
      required: ['deviceName', 'deviceType'],
      properties: {
        deviceName: { example: 'Test Kiosk 1' },
        deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate', 'camera', 'printer', 'edc'], example: 'kiosk', description: 'kiosk/barrier_gate return an activation code, camera/printer return a one-time deviceToken, edc registers an EDC terminal (terminalId required).' },
        deviceCode: { example: 'KIOSK-A' },
        name: { example: 'Test Kiosk 1' },
        location: { example: 'Main Lobby' },
        gateId: { example: 'GATE-A' },
        direction: { enum: ['IN', 'OUT'], example: 'OUT' },
        cameraIds: { example: ['CAM-OUT-A'] },
        printerIds: { example: ['PRN-GATE-A'] },
        connectionType: { example: 'lan' },
        ipAddress: { example: '192.168.1.50', description: 'Camera/printer only.' },
        deviceId: { type: 'string', example: 'CAM-OUT-A', description: 'Camera/printer only: optional fixed deviceId (defaults to deviceCode or a generated id).' },
        cameraRole: { example: 'lpr', description: 'Camera only.' },
        printerRole: { example: 'receipt', description: 'Printer only.' },
        edcDeviceId: { example: 'EDC-20261001-001', description: 'Kiosk/Barrier Gate only: registered EDC device (deviceType edc, usage device) bound to this device. One EDC can be bound to one device (409 EDC_DEVICE_IN_USE). Required before the device can take cards; send null to unbind.' },
        terminalId: { example: 'TID-12345678', description: 'EDC devices only: terminal id (TID) printed on the slip. Unique among EDC devices (409 EDC_TERMINAL_ID_EXISTS).' },
        merchantId: { example: 'MID-0001', description: 'EDC devices only.' },
        provider: { example: 'KBank', description: 'EDC devices only: bank or EDC provider.' },
        serialNo: { example: 'SN123456', description: 'EDC devices only.' },
        usage: { example: 'device', description: 'EDC devices only: cashier = used at the Admin counter, device = bound to a kiosk or barrier gate. An EDC bound to a device cannot change to cashier.' },
        allowedIps: { example: ['10.0.0.21'], description: 'Optional IP allowlist. When not empty, the device token works only from these IPs (403 INVALID_DEVICE_CREDENTIALS reason ip_not_allowed). Empty = no IP limit, except kiosk/barrier_gate when the server sets REQUIRE_DEVICE_ALLOWED_IPS=true.' },
      },
    }),
    DeviceActivationCodeCreateResponse: {
      type: 'object',
      properties: {
        CodeActivate: { type: 'string', example: '839725', description: 'Activation code, valid for 10 minutes.' },
        activationExpiresAt: { type: 'string', format: 'date-time' },
        deviceName: { type: 'string', example: 'Test Kiosk 1' },
        deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate'], example: 'kiosk' },
        status: { type: 'string', example: 'pending_activation' },
        isOnline: { type: 'boolean', example: false },
        device: ref('DeviceResponse'),
      },
    },
    DeviceUpdateRequest: fromZod(updateDeviceBodySchema, {
      properties: {
        deviceCode: { example: 'KIOSK-A', description: 'Must not be empty or equal the id, deviceId, or deviceCode of another device (409 DEVICE_CODE_EXISTS).' },
        deviceName: { example: 'Kiosk A' },
        name: { example: 'Kiosk A', description: 'Alias for deviceName.' },
        deviceType: { example: 'kiosk' },
        connectionType: { example: 'lan' },
        ipAddress: { example: '192.168.1.20' },
        ip: { example: '192.168.1.20', description: 'Alias for ipAddress.' },
        location: { example: 'Main Lobby' },
        gateId: { example: 'GATE-A' },
        direction: { enum: ['IN', 'OUT'], example: 'OUT' },
        cameraIds: { example: ['CAM-OUT-A'], description: 'Barrier Gate only. A non-empty list on another device type returns 400 DEVICE_MAPPING_NOT_SUPPORTED; [] is accepted.' },
        cameraRole: { example: 'lpr' },
        printerIds: { example: ['PRN-GATE-A'], description: 'Kiosk and Barrier Gate only. A non-empty list on another device type returns 400 DEVICE_MAPPING_NOT_SUPPORTED; [] is accepted.' },
        printerRole: { example: 'receipt' },
        status: { example: 'maintenance', description: 'pending_activation and offline are set by the backend. A device waiting for activation cannot change status (409 DEVICE_PENDING_ACTIVATION). active does not mark the device online until its next heartbeat; maintenance/inactive set isOnline false. inactive devices cannot use their token or get a new activation code until set back to active.' },
        isOnline: { example: false },
        note: { example: 'Temporarily disabled for maintenance' },
        edcDeviceId: { example: 'EDC-20261001-001', description: 'Kiosk/Barrier Gate only: registered EDC device (deviceType edc, usage device) bound to this device. One EDC can be bound to one device (409 EDC_DEVICE_IN_USE). Required before the device can take cards; send null to unbind.' },
        terminalId: { example: 'TID-12345678', description: 'EDC devices only: terminal id (TID) printed on the slip. Unique among EDC devices (409 EDC_TERMINAL_ID_EXISTS).' },
        merchantId: { example: 'MID-0001', description: 'EDC devices only.' },
        provider: { example: 'KBank', description: 'EDC devices only: bank or EDC provider.' },
        serialNo: { example: 'SN123456', description: 'EDC devices only.' },
        usage: { example: 'device', description: 'EDC devices only: cashier = used at the Admin counter, device = bound to a kiosk or barrier gate. An EDC bound to a device cannot change to cashier.' },
        allowedIps: { example: ['10.0.0.21'], description: 'Optional IP allowlist. When not empty, the device token works only from these IPs (403 INVALID_DEVICE_CREDENTIALS reason ip_not_allowed). Empty = no IP limit, except kiosk/barrier_gate when the server sets REQUIRE_DEVICE_ALLOWED_IPS=true.' },
      },
    }),
    DeviceResponse: {
      description: 'Device as returned by GET /api/devices, devices_snapshot, devices_config_updated, and every create/update/mapping response. Every key of the device type is always present (missing values are null or []). Use id as the device key and in paths; deviceId is null for kiosk/barrier_gate until activation.',
      oneOf: [ref('ActivationDevice'), ref('PeripheralDevice'), ref('EdcDevice')],
      discriminator: { propertyName: 'deviceType' },
    },
    ActivationDevice: {
      type: 'object',
      description: 'kiosk or barrier_gate.',
      properties: {
        id: { type: 'string', example: 'K-20260525-010' },
        deviceId: { type: 'string', nullable: true, example: 'K-20260525-010', description: 'null while status is pending_activation.' },
        deviceCode: { type: 'string', nullable: true, example: 'KIOSK-A' },
        deviceName: { type: 'string', example: 'Kiosk A' },
        deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate'] },
        location: { type: 'string', nullable: true, example: 'Main Lobby' },
        status: { type: 'string', enum: ['pending_activation', 'active', 'offline', 'maintenance', 'inactive'], example: 'active' },
        isOnline: { type: 'boolean', example: true },
        note: { type: 'string', nullable: true },
        connectionType: { type: 'string', nullable: true, example: 'lan' },
        ipAddress: { type: 'string', nullable: true, example: '10.0.0.21' },
        lastSeen: { type: 'string', format: 'date-time', nullable: true },
        activatedAt: { type: 'string', format: 'date-time', nullable: true },
        allowedIps: { type: 'array', items: { type: 'string' } },
        gateId: { type: 'string', nullable: true, example: 'GATE-A' },
        direction: { type: 'string', nullable: true, enum: ['IN', 'OUT'] },
        cameraRole: { type: 'string', nullable: true },
        printerRole: { type: 'string', nullable: true },
        activationCode: { type: 'string', nullable: true, example: '839725', description: 'Set while an activation code is waiting to be used.' },
        activationExpiresAt: { type: 'string', format: 'date-time', nullable: true },
        cameraIds: { type: 'array', items: { type: 'string' }, example: ['CAM-OUT-A'], description: 'Always [] for kiosk.' },
        printerIds: { type: 'array', items: { type: 'string' }, example: ['PRN-GATE-A'] },
        edcDeviceId: { type: 'string', nullable: true, example: 'EDC-20261001-001' },
      },
    },
    PeripheralDevice: {
      type: 'object',
      description: 'camera or printer (no mappings of its own).',
      properties: {
        id: { type: 'string', example: 'CAM-OUT-A' },
        deviceId: { type: 'string', example: 'CAM-OUT-A' },
        deviceCode: { type: 'string', nullable: true, example: 'CAM-OUT-A' },
        deviceName: { type: 'string', example: 'Camera OUT A' },
        deviceType: { type: 'string', enum: ['camera', 'printer'] },
        location: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['active', 'offline', 'maintenance', 'inactive'], example: 'active' },
        isOnline: { type: 'boolean', example: false },
        note: { type: 'string', nullable: true },
        connectionType: { type: 'string', nullable: true, example: 'lan' },
        ipAddress: { type: 'string', nullable: true },
        lastSeen: { type: 'string', format: 'date-time', nullable: true, description: 'null until the first heartbeat.' },
        activatedAt: { type: 'string', format: 'date-time', nullable: true },
        allowedIps: { type: 'array', items: { type: 'string' } },
        gateId: { type: 'string', nullable: true },
        direction: { type: 'string', nullable: true, enum: ['IN', 'OUT'] },
        cameraRole: { type: 'string', nullable: true, example: 'lpr' },
        printerRole: { type: 'string', nullable: true, example: 'receipt' },
      },
    },
    EdcDevice: {
      type: 'object',
      description: 'EDC terminal (no token and no heartbeat, isOnline is always false).',
      properties: {
        id: { type: 'string', example: 'EDC-20261001-001' },
        deviceId: { type: 'string', example: 'EDC-20261001-001' },
        deviceCode: { type: 'string', nullable: true },
        deviceName: { type: 'string', example: 'EDC Counter 1' },
        deviceType: { type: 'string', enum: ['edc'] },
        location: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['active', 'maintenance', 'inactive'], example: 'active', description: 'Cards are accepted only while status is active.' },
        isOnline: { type: 'boolean', example: false },
        note: { type: 'string', nullable: true },
        terminalId: { type: 'string', example: 'TID-12345678' },
        merchantId: { type: 'string', nullable: true },
        provider: { type: 'string', nullable: true, example: 'KBank' },
        serialNo: { type: 'string', nullable: true },
        usage: { type: 'string', enum: ['cashier', 'device'] },
      },
    },
    DeviceMutationResponse: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Device updated' },
        device: ref('DeviceResponse'),
      },
    },
    DeleteSuccessResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Device deleted' },
      },
    },
    ActivationErrorResponse: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        message: { type: 'string', example: 'deviceType must be kiosk or barrier_gate' },
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: { field: { type: 'string', nullable: true }, message: { type: 'string' } },
          },
        },
      },
    },
    ActivationRequest: fromZod(activateDeviceBodySchema, {
      properties: {
        code: { type: 'string', example: '123456', description: '400 VALIDATION_ERROR when missing.' },
      },
    }),
    ActivationResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Activation successful' },
        deviceToken: { type: 'string', description: 'Secret device credential returned only once during activation. Store it on the device and send it with X-Device-Token or Authorization: Device <token>.' },
        deviceId: { type: 'string', example: 'K-20260524-001' },
        deviceType: { type: 'string', example: 'kiosk' },
        deviceName: { type: 'string', example: 'Test Kiosk 1' },
        location: { type: 'string', nullable: true, example: 'Main Lobby' },
        gateId: { type: 'string', nullable: true, example: 'GATE-A' },
        direction: { type: 'string', nullable: true, enum: ['IN', 'OUT'], example: 'OUT' },
        cameraIds: { type: 'array', items: { type: 'string' }, example: ['CAM-OUT-A'] },
        cameraRole: { type: 'string', nullable: true, example: 'lpr' },
        status: { type: 'string', example: 'active' },
      },
    },
    CameraProvisionResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Camera provisioned' },
        device: ref('DeviceResponse'),
        deviceToken: { type: 'string', description: 'Secret device credential returned only once. Store it in the LPR middleware or Postman environment.' },
      },
    },
    PrinterProvisionResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Printer provisioned' },
        device: ref('DeviceResponse'),
        deviceToken: { type: 'string', description: 'Secret device credential returned only once. Store it in the printer service, kiosk, barrier gate, or Postman environment.' },
      },
    },
    CheckInRequest: fromZod(heartbeatBodySchema, {
      properties: {
        deviceId: { type: 'string', example: 'K-20260524-001', description: 'Filled from X-Device-Id when omitted (400 DEVICE_ID_REQUIRED).' },
        name: { type: 'string', example: 'Kiosk A' },
        location: { type: 'string', example: 'Main Lobby' },
      },
    }),
    ThemeUpdateRequest: fromZod(updateThemeBodySchema, {
      properties: {
        themeColor: { example: '#2563eb' },
        logoUrl: { example: '/uploads/logo.png' },
        themeMode: { example: 'custom', description: 'Empty string = not chosen.' },
        customThemeColor: { example: '#2563eb' },
      },
    }),
    PricingConfigUpdateRequest: fromZod(updatePricingConfigBodySchema),
    SystemSettingsUpdateRequest: fromZod(systemSettingsBodySchema),
    ResolveRefundRequest: fromZod(resolveRefundBodySchema, {
      properties: {
        note: { example: 'Refunded by bank transfer' },
      },
    }),
    SimulatePaidRequest: fromZod(chargeIdInputSchema, {
      properties: {
        chargeId: { type: 'string', example: 'chrg_test_123', description: '400 VALIDATION_ERROR when missing.' },
        simulationToken: { type: 'string', example: 'uat-secret' },
      },
    }),
  },
};

export default components;
