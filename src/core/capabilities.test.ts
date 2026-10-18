import { bootstrapSchema, canBrowse, canUse } from './capabilities';
import { tenantA } from '../test/fixtures';
it('fails closed for missing/unknown capability, lifecycle and compatibility', () => {
  const bootstrap = bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'CHF',
    locale: 'fr',
    timezone: 'Europe/Zurich',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: {},
    capabilities: { menu: 'enabled', payments: 'unknown' },
  });
  expect(canUse(undefined, 'menu')).toBe(false);
  expect(canUse(bootstrap, 'menu')).toBe(true);
  expect(canUse(bootstrap, 'payments')).toBe(false);
  expect(canUse(bootstrap, 'missing')).toBe(false);
  expect(canUse({ ...bootstrap, lifecycle: 'read-only' }, 'menu')).toBe(false);
  expect(canUse({ ...bootstrap, compatibility: 'update-required' }, 'menu')).toBe(false);
  expect(() => bootstrapSchema.parse({ ...bootstrap, timezone: 'Invalid/Zone' })).toThrow();
});

it('permits read-only browsing but never uses disabled or unknown menu capabilities', () => {
  const bootstrap = bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: null,
    locale: 'fr',
    timezone: 'Europe/Zurich',
    lifecycle: 'read-only',
    compatibility: 'supported',
    modules: [],
    flags: {},
    capabilities: { menu: 'enabled' },
  });
  expect(canBrowse(bootstrap)).toBe(true);
  expect(canBrowse(undefined)).toBe(false);
  expect(canBrowse({ ...bootstrap, lifecycle: 'disabled' })).toBe(false);
  expect(canBrowse({ ...bootstrap, compatibility: 'update-required' })).toBe(false);
  expect(canBrowse({ ...bootstrap, capabilities: {} })).toBe(false);
});
