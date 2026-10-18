import { bootstrapSchema } from '../core/capabilities';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
export async function readBootstrap(client: CustomerTransport, context: TenantContext) {
  const bootstrap = await client.request(
    context,
    '/api/tenant/mobile/bootstrap?contractVersion=1',
    bootstrapSchema,
  );
  if (bootstrap.tenantId !== context.tenant.id) throw new ApiFailure(200, 'contract');
  return bootstrap;
}
