// Import Library
import type { TestContext } from 'node:test';
// Import Test Helpers
import { fixture, stub } from './mock';
// Import Services
import * as deviceRegistryService from '../../src/services/shared/device-registry.service';
// Import Types
import type { DeviceRecord } from '../../src/types/shared/device.type';
// Import Utils
import { hashToken } from '../../src/utils/crypto';

/* -------------------------------------- Types -------------------------------------- */

// Type อุปกรณ์ใน registry ที่ test กำหนด (token = device token ที่ใช้ได้)
interface RegisteredDeviceStub {
  token?: string;
  deviceType?: string;
  deviceName?: string;
  status?: string;
  allowedIps?: string[];
}

/* -------------------------------------- Functions -------------------------------------- */

// Function stub device registry ให้มีอุปกรณ์ตาม deviceId ที่กำหนด (default kiosk active token "valid") ส่วนการตรวจ token ใช้ของจริง
// อ่าน devices ตอนเรียกทุกครั้ง test จึงแก้ค่าใน object ระหว่าง test ได้
function stubRegisteredDevices(t: Pick<TestContext, 'after'>, devices: Record<string, RegisteredDeviceStub>): void {
  stub(t, deviceRegistryService, {
    getRegisteredDevice: async (deviceId) => {
      const device = devices[deviceId ?? ''];
      if (!device) return null;
      const { token = 'valid', ...fields } = device;
      return fixture<DeviceRecord>({ id: deviceId, deviceId, deviceType: 'kiosk', status: 'active', allowedIps: [], ...fields, deviceTokenHash: hashToken(token) });
    },
  });
}

export { stubRegisteredDevices };
