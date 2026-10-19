import type { z } from 'zod';
import type { TenantContext } from './tenantContext';
import type { CustomerTransport } from './transport';
export function readSession<T>(
  client: CustomerTransport,
  context: TenantContext,
  userId: string,
  path: string,
  schema: z.ZodType<T>,
  assertCurrent: () => void,
): Promise<T> {
  return client.request(context, path, schema, {
    credentials: 'customer',
    principal: { kind: 'customer', id: userId },
    assertCurrent,
  });
}
