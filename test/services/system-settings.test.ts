// Import Library
import assert from 'node:assert/strict';
import test from 'node:test';
// Import Test Helpers
import { fixture, stub } from '../support/mock';
// Import Repositories
import * as appConfigRepository from '../../src/repositories/shared/app-config.repository';
// Import Services
import * as systemSettingsService from '../../src/services/system-settings.service';
// Import Types
import type { SystemSettings } from '../../src/types/shared/config.type';

/* -------------------------------------- Tests -------------------------------------- */

test('system settings drop receipt.paperWidth because the paper width lives in receipt.printer', async (t) => {
  const stored = fixture<SystemSettings>({ general: {}, billing: {}, receipt: { paperWidth: '80mm', printer: { paperWidth: 80 }, footerText: 'Thank you' } });
  let saved: SystemSettings | null = null;
  stub(t, appConfigRepository, {
    getConfig: async () => stored,
    getConfigWithMeta: async () => ({ ...stored, configUpdatedAt: null }),
    setConfig: async (_key, value) => {
      saved = value as SystemSettings;
      return { ...value, configUpdatedAt: null };
    },
  });

  const settings = await systemSettingsService.getSystemSettings();
  await systemSettingsService.updateSystemSettings({ receipt: { paperWidth: '58mm', printer: { paperWidth: '58' } } });

  assert.equal('paperWidth' in settings.receipt, false);
  assert.equal(saved && 'paperWidth' in (saved as SystemSettings).receipt, false);
  assert.equal((saved as SystemSettings | null)?.receipt.printer?.paperWidth, 58);
});
