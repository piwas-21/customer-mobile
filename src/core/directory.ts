import { z } from 'zod';

export const DIRECTORY_MAX_TENANTS = 1000;
export const environmentSchema = z.enum(['staging', 'production']);
export type Environment = z.infer<typeof environmentSchema>;
export const originSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    value === url.origin
  );
}, 'Expected a canonical HTTPS origin');
const tenantSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1).max(120),
    apiOrigin: originSchema,
    webOrigin: originSchema,
    imageOrigin: originSchema,
    status: z.enum(['active', 'read-only', 'disabled']),
    contractVersions: z.array(z.number().int().positive()).min(1),
  })
  .strict();
export type Tenant = Readonly<
  Omit<z.infer<typeof tenantSchema>, 'contractVersions'> & { contractVersions: readonly number[] }
>;
const directorySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    environment: environmentSchema,
    publishedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    tenants: z.array(tenantSchema).max(DIRECTORY_MAX_TENANTS),
  })
  .strict();
export type Directory = Readonly<
  Omit<z.infer<typeof directorySchema>, 'tenants'> & { tenants: readonly Tenant[] }
>;
export const DIRECTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DIRECTORY_CLOCK_SKEW_MS = 60_000;
export function parseDirectory(
  input: unknown,
  environment: Environment,
  now = Date.now(),
): Directory {
  const directory = directorySchema.parse(input);
  const published = Date.parse(directory.publishedAt);
  const expires = Date.parse(directory.expiresAt);
  if (
    directory.environment !== environment ||
    published > now + DIRECTORY_CLOCK_SKEW_MS ||
    expires <= now ||
    expires <= published ||
    expires - published > DIRECTORY_MAX_AGE_MS
  ) {
    throw new Error('Directory is expired or incompatible');
  }
  for (const key of ['id', 'slug', 'apiOrigin'] as const) {
    if (new Set(directory.tenants.map((tenant) => tenant[key])).size !== directory.tenants.length) {
      throw new Error('Directory contains ambiguous tenant identities');
    }
  }
  return Object.freeze({
    ...directory,
    tenants: Object.freeze(
      directory.tenants.map((tenant) =>
        Object.freeze({ ...tenant, contractVersions: Object.freeze([...tenant.contractVersions]) }),
      ),
    ),
  });
}
export function resolveTenant(directory: Directory, id: string, now = Date.now()): Tenant {
  if (Date.parse(directory.expiresAt) <= now) throw new Error('Directory expired');
  const tenant = directory.tenants.find((item) => item.id === id);
  if (!tenant || tenant.status === 'disabled' || !tenant.contractVersions.includes(1)) {
    throw new Error('Restaurant is unavailable');
  }
  return tenant;
}
