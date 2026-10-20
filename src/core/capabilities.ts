import { z } from 'zod';
export const capabilityStateSchema = z.enum(['enabled', 'disabled', 'unavailable', 'unknown']);
export const bootstrapSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.uuid(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  locale: z.string().min(2),
  timezone: z.string().refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }),
  lifecycle: z.enum(['active', 'read-only', 'disabled']),
  compatibility: z.enum(['supported', 'update-required', 'unavailable']),
  modules: z.array(z.string()),
  flags: z.record(z.string(), z.boolean()),
  capabilities: z.record(z.string(), capabilityStateSchema),
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export function canUse(bootstrap: Bootstrap | undefined, capability: string): boolean {
  return (
    bootstrap?.lifecycle === 'active' &&
    bootstrap.compatibility === 'supported' &&
    bootstrap.capabilities[capability] === 'enabled'
  );
}

export function canBrowse(bootstrap: Bootstrap | undefined): boolean {
  return Boolean(
    bootstrap &&
    bootstrap.lifecycle !== 'disabled' &&
    bootstrap.compatibility === 'supported' &&
    bootstrap.capabilities.menu === 'enabled',
  );
}
export function canUseNativeAccountLinks(bootstrap: Bootstrap | undefined): boolean {
  return canUse(bootstrap, 'accounts') && bootstrap?.flags.nativeAccountLinksV1 === true;
}
