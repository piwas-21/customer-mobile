import { SessionController } from '../core/sessionController';
import { SessionRepository } from '../core/sessionRepository';
import { CustomerTransport, type Fetch } from '../core/transport';
import { TenantBoundary } from '../core/tenantContext';
import { fixtureDirectory, memorySecrets, tenantA } from './fixtures';
import { response } from './transport';
export const session = { userId: tenantA, accessToken: 'old-access', refreshToken: 'old-refresh' };
export const renewed = { ...session, accessToken: 'new-access', refreshToken: 'new-refresh' };
export const authResponse = (value = renewed) =>
  response({ success: true, data: { ...value, role: 'Customer' } });
export const dataResponse = () => response({ success: true, data: 'private profile' });
export async function sessionSetup(selected = true) {
  const store = memorySecrets();
  const repository = new SessionRepository(store);
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(boundary, repository.vault, fetcher);
  const controller = new SessionController(context, client, repository);
  if (selected) await repository.activate(context, session, () => true);
  await controller.initialize();
  return { store, repository, boundary, context, fetcher, client, controller };
}
