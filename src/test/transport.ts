import { CustomerTransport, type Fetch } from '../core/transport';
import { CredentialVault } from '../core/credentials';
import { TenantBoundary } from '../core/tenantContext';
import { fixtureDirectory, memorySecrets, tenantA } from './fixtures';
export function response(body: unknown, status = 200, contentType = 'application/json'): Response {
  return {
    ok: status < 400,
    status,
    headers: { get: () => contentType },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}
export function setup() {
  const boundary = new TenantBoundary(fixtureDirectory());
  const vault = new CredentialVault(memorySecrets());
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(boundary, vault, fetcher);
  return { boundary, vault, fetcher, client, context: boundary.select(tenantA) };
}
