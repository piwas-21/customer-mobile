import { tenantA } from './fixtures';
import { response } from './transport';
export const nativeAccountBootstrap = {
  schemaVersion: 1,
  tenantId: tenantA,
  currency: 'EUR',
  locale: 'en',
  timezone: 'Europe/Paris',
  lifecycle: 'active',
  compatibility: 'supported',
  modules: [],
  flags: { nativeAccountLinksV1: true },
  capabilities: { accounts: 'enabled' },
};
export const nativeBootstrapResponse = (value: unknown = nativeAccountBootstrap) =>
  response({ success: true, data: value });
export const nativeAccountProof = 'C'.repeat(96);
