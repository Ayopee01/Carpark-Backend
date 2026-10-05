// Import Docs
import { ref } from './helpers';

/* -------------------------------------- Components -------------------------------------- */

// Config OpenAPI components ที่หลาย tag อ้างอิงร่วมกัน (security schemes และ schemas)
const components = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT-like signed access token',
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
      description: 'Device token returned once during activation.',
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
      },
    },
    LoginRequest: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string', example: 'admin1' },
        password: { type: 'string', example: '123' },
      },
    },
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
    UserCreateRequest: {
      type: 'object',
      required: ['username', 'password', 'name'],
      properties: {
        username: { type: 'string', example: 'staff1' },
        password: { type: 'string', example: '123456' },
        name: { type: 'string', example: 'Staff One' },
        email: { type: 'string', example: 'staff1@example.com' },
        phone: { type: 'string', example: '0812345678' },
        role: { type: 'string', example: 'staff' },
        permissions: { type: 'array', items: { type: 'string' }, example: ['dashboard', 'transactions'] },
        status: { type: 'string', example: 'active' },
      },
    },
    UserUpdateRequest: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        role: { type: 'string' },
        permissions: { type: 'array', items: { type: 'string' } },
        status: { type: 'string' },
      },
    },
    MemberCreateRequest: {
      type: 'object',
      required: ['password'],
      properties: {
        username: { type: 'string', example: 'cashier1', description: 'Required when email is not supplied.' },
        password: { type: 'string', example: '123456' },
        firstName: { type: 'string', example: 'Cashier' },
        lastName: { type: 'string', example: 'One' },
        name: { type: 'string', example: 'Cashier One', description: 'Required when firstName/lastName are not supplied.' },
        email: { type: 'string', example: 'cashier1@example.com' },
        role: { type: 'string', example: 'staff' },
        status: { type: 'string', example: 'active' },
        permissions: { type: 'array', items: { type: 'string' }, example: ['transactions'] },
      },
    },
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
    CameraTransactionRequest: {
      type: 'object',
      required: ['plateNo', 'cameraId', 'direction'],
      properties: {
        plateNo: { type: 'string', example: '3งจ9012' },
        vehicleType: { type: 'string', enum: ['car', 'motorcycle'], default: 'car' },
        cameraId: { type: 'string', example: 'CAM-IN-01' },
        gateId: { type: 'string', nullable: true, example: 'GATE-A', description: 'Optional. If omitted, backend resolves it from cameraId and direction using barrier gate mapping.' },
        direction: { type: 'string', enum: ['IN', 'OUT'], example: 'IN' },
        capturedAt: { type: 'string', format: 'date-time', example: '2026-05-25T10:30:00+07:00' },
        imageUrl: { type: 'string', example: 'https://example.com/plate.jpg' },
      },
    },
    TransactionUpdateRequest: {
      type: 'object',
      description: 'Unknown fields are ignored. Date-time values without a timezone are read as Bangkok time.',
      properties: {
        plateNo: { type: 'string', example: '3งจ9012' },
        vehicleType: { type: 'string', enum: ['car', 'motorcycle'] },
        serviceType: { type: 'string', example: 'parking' },
        status: { type: 'string', enum: ['pending', 'partially_paid', 'paid_waiting_exit', 'completed', 'cancelled'] },
        totalPaid: { type: 'number', minimum: 0, example: 40, description: 'At most 2 decimals.' },
        payments: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['paidAmount', 'paidAt'],
            properties: { paidAmount: { type: 'number', minimum: 0 }, paidAt: { type: 'string', format: 'date-time' } },
          },
        },
        exitTimeLimit: { type: 'string', format: 'date-time', nullable: true },
        exitAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
    PaymentRequest: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', example: 't_123' },
        plateNo: { type: 'string', example: '3งจ9012' },
        method: { type: 'string', enum: ['cash', 'qr', 'bank1', 'wallet', 'other'], example: 'cash', description: 'Must be active in payment_settings.methods and allowed by the selected channel.' },
        channel: { type: 'string', enum: ['cashier', 'mobile', 'kiosk', 'gate'], example: 'cashier', description: 'Admin payment accepts only cashier (or omitted). Client payment ignores this field and derives the channel from the client source.' },
        amount: { type: 'number', example: 40, description: 'Admin cashier only: optional partial amount, must be > 0 and not above the remaining amount (400 AMOUNT_EXCEEDS_REMAINING). Omitted = pay the full remaining amount. Client payment ignores this field.' },
        deviceId: { type: 'string', example: 'K-20260524-001' },
        deviceName: { type: 'string', example: 'Kiosk A' },
        deviceLocation: { type: 'string', example: 'Main Lobby' },
        reference: { type: 'string', maxLength: 100, example: 'APPR-123456', description: 'Admin only: EDC approval code or slip number. Required when method is card (400 PAYMENT_REFERENCE_REQUIRED); stored on the payment as reference. A reference (with terminalId) can be used for one transaction only (409 PAYMENT_REFERENCE_USED).' },
        edcDeviceId: { type: 'string', maxLength: 50, example: 'EDC-20261001-002', description: 'Admin only: cashier EDC device chosen by staff (from GET /api/payments/edc/terminals). Required when method is card (400 EDC_DEVICE_REQUIRED); must be an active EDC with usage cashier (400 EDC_DEVICE_NOT_FOUND / EDC_DEVICE_NOT_CASHIER, 409 EDC_DEVICE_UNAVAILABLE). The backend stores its terminalId on the payment.' },
        confirmPendingCharge: { type: 'boolean', example: false, description: 'Admin only: true = take this payment even though an Omise QR of the transaction is still payable (after 409 PENDING_GATEWAY_CHARGE).' },
      },
    },
    OmiseChargeRequest: {
      type: 'object',
      required: ['plateNo'],
      properties: {
        plateNo: { type: 'string', example: '3งจ9012' },
        source: { type: 'string', example: 'src_test_123', description: 'Optional for PromptPay: omit it and send method promptpay to let the backend create the source.' },
        sourceType: { type: 'string', example: 'promptpay' },
        method: { type: 'string', example: 'promptpay', description: 'Payment method id from payment-settings. Required unless sourceType is supplied. Card tokens are not accepted; cards use the EDC terminal.' },
        deviceId: { type: 'string', example: 'K-20260524-001' },
        returnUri: { type: 'string', example: 'https://carpark-uat.biza.me/payment/result' },
      },
    },
    AdminOmiseChargeRequest: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', example: 't_123', description: 'Preferred admin lookup key.' },
        plateNo: { type: 'string', example: '3งจ9012', description: 'Fallback lookup key when transactionId is not supplied.' },
        source: { type: 'string', example: 'src_test_123', description: 'Optional for PromptPay: omit it and send method promptpay to let the backend create the source. Other source types need an Omise.js source id.' },
        sourceType: { type: 'string', example: 'promptpay' },
        method: { type: 'string', example: 'promptpay', description: 'Payment method id from payment-settings.' },
        channel: { type: 'string', enum: ['cashier'], example: 'cashier', description: 'Admin Omise payments must stay cashier, including PromptPay/QR.' },
        amount: { type: 'integer', example: 4000, description: 'Optional minor currency amount for validation; 4000 means 40.00 THB.' },
        returnUri: { type: 'string', example: 'https://carpark-uat.biza.me/payments/result' },
      },
    },
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
        message: { type: 'string', example: 'Payment confirmed successfully' },
        data: {
          type: 'object',
          properties: {
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
              nullable: true,
              properties: {
                paymentId: { type: 'string', example: 'pay_48bd0519-348f-4ae1-832a-8f15f50f534e' },
                method: { type: 'string', example: 'cash' },
                channel: { type: 'string', example: 'cashier' },
                paidAmount: { type: 'number', example: 435 },
                paidAt: { type: 'string', format: 'date-time' },
                processedBy: { type: 'string', example: 'u5' },
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
        status: { type: 'string', example: 'active' },
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
    PaymentMethodUpdateRequest: {
      type: 'object',
      additionalProperties: true,
      properties: {
        isActive: { type: 'boolean', example: true },
      },
    },
    ChannelMappingUpdateRequest: {
      type: 'object',
      required: ['allowedMethods'],
      properties: {
        allowedMethods: { type: 'array', items: { type: 'string' }, example: ['cash', 'qr', 'wallet'] },
      },
    },
    DeviceActivationCodeCreateRequest: {
      type: 'object',
      required: ['deviceName', 'deviceType'],
      properties: {
        deviceName: { type: 'string', example: 'Test Kiosk 1' },
        deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate', 'camera', 'printer', 'edc'], example: 'kiosk', description: 'kiosk/barrier_gate return an activation code, camera/printer return a one-time deviceToken, edc registers an EDC terminal (terminalId required).' },
        deviceCode: { type: 'string', example: 'KIOSK-A' },
        name: { type: 'string', example: 'Test Kiosk 1' },
        location: { type: 'string', example: 'Main Lobby' },
        gateId: { type: 'string', nullable: true, example: 'GATE-A' },
        direction: { type: 'string', nullable: true, enum: ['IN', 'OUT'], example: 'OUT' },
        cameraIds: { type: 'array', items: { type: 'string' }, example: ['CAM-OUT-A'] },
        printerIds: { type: 'array', items: { type: 'string' }, example: ['PRN-GATE-A'] },
        connectionType: { type: 'string', example: 'lan' },
        ipAddress: { type: 'string', example: '192.168.1.50', description: 'Camera/printer only.' },
        deviceId: { type: 'string', example: 'CAM-OUT-A', description: 'Camera/printer only: optional fixed deviceId (defaults to deviceCode or a generated id).' },
        cameraRole: { type: 'string', example: 'lpr', description: 'Camera only.' },
        printerRole: { type: 'string', example: 'receipt', description: 'Printer only.' },
        note: { type: 'string' },
        edcDeviceId: { type: 'string', nullable: true, example: 'EDC-20261001-001', description: 'Kiosk/Barrier Gate only: registered EDC device (deviceType edc, usage device) bound to this device. One EDC can be bound to one device (409 EDC_DEVICE_IN_USE). Required before the device can take cards; send null to unbind.' },
        terminalId: { type: 'string', example: 'TID-12345678', description: 'EDC devices only: terminal id (TID) printed on the slip. Unique among EDC devices (409 EDC_TERMINAL_ID_EXISTS).' },
        merchantId: { type: 'string', nullable: true, example: 'MID-0001', description: 'EDC devices only.' },
        provider: { type: 'string', nullable: true, example: 'KBank', description: 'EDC devices only: bank or EDC provider.' },
        serialNo: { type: 'string', nullable: true, example: 'SN123456', description: 'EDC devices only.' },
        usage: { type: 'string', enum: ['cashier', 'device'], example: 'device', description: 'EDC devices only: cashier = used at the Admin counter, device = bound to a kiosk or barrier gate. An EDC bound to a device cannot change to cashier.' },
        allowedIps: { type: 'array', items: { type: 'string' }, example: ['10.0.0.21'], description: 'Optional IP allowlist. When not empty, the device token works only from these IPs (403 INVALID_DEVICE_CREDENTIALS reason ip_not_allowed). Empty = no IP limit.' },
      },
    },
    DeviceActivationCodeCreateResponse: {
      type: 'object',
      properties: {
        CodeActivate: { type: 'string', example: '839725' },
        deviceName: { type: 'string', example: 'Test Kiosk 1' },
        deviceType: { type: 'string', example: 'kiosk' },
        status: { type: 'string', example: 'active' },
        isOnline: { type: 'boolean', example: true },
      },
    },
    DeviceUpdateRequest: {
      type: 'object',
      additionalProperties: false,
      properties: {
        deviceCode: { type: 'string', example: 'KIOSK-A' },
        deviceName: { type: 'string', example: 'Kiosk A' },
        name: { type: 'string', example: 'Kiosk A', description: 'Alias for deviceName.' },
        deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate', 'camera', 'printer'], example: 'kiosk' },
        connectionType: { type: 'string', example: 'lan' },
        ipAddress: { type: 'string', nullable: true, example: '192.168.1.20' },
        ip: { type: 'string', nullable: true, example: '192.168.1.20', description: 'Alias for ipAddress.' },
        location: { type: 'string', nullable: true, example: 'Main Lobby' },
        gateId: { type: 'string', nullable: true, example: 'GATE-A' },
        direction: { type: 'string', nullable: true, enum: ['IN', 'OUT'], example: 'OUT' },
        cameraIds: { type: 'array', items: { type: 'string' }, example: ['CAM-OUT-A'] },
        cameraRole: { type: 'string', nullable: true, example: 'lpr' },
        printerIds: { type: 'array', items: { type: 'string' }, example: ['PRN-GATE-A'] },
        printerRole: { type: 'string', nullable: true, example: 'receipt' },
        status: { type: 'string', enum: ['pending_activation', 'active', 'offline', 'maintenance'], example: 'maintenance' },
        isOnline: { type: 'boolean', example: false },
        note: { type: 'string', example: 'Temporarily disabled for maintenance' },
        edcDeviceId: { type: 'string', nullable: true, example: 'EDC-20261001-001', description: 'Kiosk/Barrier Gate only: registered EDC device (deviceType edc, usage device) bound to this device. One EDC can be bound to one device (409 EDC_DEVICE_IN_USE). Required before the device can take cards; send null to unbind.' },
        terminalId: { type: 'string', example: 'TID-12345678', description: 'EDC devices only: terminal id (TID) printed on the slip. Unique among EDC devices (409 EDC_TERMINAL_ID_EXISTS).' },
        merchantId: { type: 'string', nullable: true, example: 'MID-0001', description: 'EDC devices only.' },
        provider: { type: 'string', nullable: true, example: 'KBank', description: 'EDC devices only: bank or EDC provider.' },
        serialNo: { type: 'string', nullable: true, example: 'SN123456', description: 'EDC devices only.' },
        usage: { type: 'string', enum: ['cashier', 'device'], example: 'device', description: 'EDC devices only: cashier = used at the Admin counter, device = bound to a kiosk or barrier gate. An EDC bound to a device cannot change to cashier.' },
        allowedIps: { type: 'array', items: { type: 'string' }, example: ['10.0.0.21'], description: 'Optional IP allowlist. When not empty, the device token works only from these IPs (403 INVALID_DEVICE_CREDENTIALS reason ip_not_allowed). Empty = no IP limit.' },
      },
    },
    DeviceResponse: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', example: 'K-20260525-010' },
        deviceName: { type: 'string', example: 'Test Kiosk 1' },
        deviceType: { type: 'string', enum: ['kiosk', 'barrier_gate', 'camera', 'printer', 'lpr'], example: 'kiosk' },
        connectionType: { type: 'string', example: 'lan' },
        location: { type: 'string', nullable: true, example: 'Zone A' },
        ipAddress: { type: 'string', nullable: true, example: '::ffff:172.23.0.2' },
        gateId: { type: 'string', nullable: true, example: 'GATE-A' },
        direction: { type: 'string', nullable: true, enum: ['IN', 'OUT'], example: 'OUT' },
        cameraIds: { type: 'array', items: { type: 'string' }, example: ['CAM-OUT-A'] },
        cameraRole: { type: 'string', nullable: true, example: 'lpr' },
        printerIds: { type: 'array', items: { type: 'string' }, example: ['PRN-GATE-A'] },
        printerRole: { type: 'string', nullable: true, example: 'receipt' },
        status: { type: 'string', example: 'offline' },
        isOnline: { type: 'boolean', example: false },
        note: { type: 'string', example: 'Waiting for activation' },
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
    ActivationRequest: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', example: '123456' },
      },
    },
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
    CheckInRequest: {
      type: 'object',
      required: ['deviceId'],
      properties: {
        deviceId: { type: 'string', example: 'K-20260524-001' },
        name: { type: 'string', example: 'Kiosk A' },
        location: { type: 'string', example: 'Main Lobby' },
      },
    },
    ThemeUpdateRequest: {
      type: 'object',
      properties: {
        themeColor: { type: 'string', nullable: true, example: '#2563eb' },
        logoUrl: { type: 'string', nullable: true, example: '/uploads/logo.png' },
        themeMode: { type: 'string', example: 'custom' },
        customThemeColor: { type: 'string', nullable: true, example: '#2563eb' },
      },
    },
  },
};

export default components;
