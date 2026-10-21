import { canonicalUuidSchema } from './identifiers';
import { z } from 'zod';
import { type Directory, originSchema, resolveTenant } from './directory';
const destinationSchema = z.enum([
  'menu',
  'table',
  'order',
  'reservation',
  'verify',
  'recover',
  'payment-return',
]);
export type AppDestination = {
  tenantId: string;
  destination: z.infer<typeof destinationSchema>;
  reference?: string;
  operationId?: string;
};
export function resolveLink(
  value: string,
  linkOrigin: string,
  directory: Directory,
): AppDestination {
  originSchema.parse(linkOrigin);
  const url = new URL(value);
  if (url.origin !== linkOrigin || url.username || url.password || url.hash)
    throw new Error('Untrusted link');
  const parts = url.pathname.split('/');
  if (parts.length < 4 || parts.length > 5 || parts[1] !== 'r')
    throw new Error('Unknown destination');
  const slug = parts[2];
  const destination = destinationSchema.parse(parts[3]);
  const tenant = directory.tenants.find((item) => item.slug === slug);
  if (!tenant) throw new Error('Unknown restaurant');
  resolveTenant(directory, tenant.id);
  const reference = parts[4];
  if (reference && !/^[a-zA-Z0-9_-]{1,128}$/.test(reference)) throw new Error('Invalid reference');
  if ([...url.searchParams.keys()].some((key) => key !== 'operation'))
    throw new Error('Unexpected link data');
  if (url.searchParams.getAll('operation').length > 1) throw new Error('Ambiguous operation');
  const operation = url.searchParams.get('operation');
  if (destination === 'table' && !reference) throw new Error('Table QR required');
  if (destination === 'payment-return') {
    const orderId = canonicalUuidSchema.parse(reference);
    const operationId = canonicalUuidSchema.parse(operation);
    return { tenantId: tenant.id, destination, reference: orderId, operationId };
  }
  if (operation !== null) throw new Error('Unexpected operation');
  return { tenantId: tenant.id, destination, ...(reference ? { reference } : {}) };
}
export class EntrySelection {
  private explicitlySelected = false;
  private referrerConsumed = false;
  explicit(): void {
    this.explicitlySelected = true;
  }
  consumeReferrer(referrer: string): string | undefined {
    if (this.referrerConsumed) return undefined;
    this.referrerConsumed = true;
    if (this.explicitlySelected) return undefined;
    const params = new URLSearchParams(referrer);
    const tenant = params.get('tenant');
    return tenant && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant) ? tenant : undefined;
  }
}
