import { BasketOperationController } from '../core/basketOperationController';
import { SessionController } from '../core/sessionController';
import { CustomerTransport, type Fetch } from '../core/transport';
import type { SecretStore } from '../core/credentials';
import { basketOperationsFixture, basketPrincipal } from './basketOperations';
import { basketResponse } from './basketApi';
import { session } from './sessions';
import { response } from './transport';
export async function basketControllerFixture(
  customer = false,
  wrap?: (store: SecretStore) => SecretStore,
) {
  const fixture = basketOperationsFixture(wrap);
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(fixture.boundary, fixture.repository.vault, fetcher);
  const sessions = new SessionController(fixture.context, client, fixture.repository);
  const principal = customer ? { kind: 'customer' as const, id: session.userId } : basketPrincipal;
  if (customer) await fixture.repository.activate(fixture.context, session, () => true);
  await sessions.initialize();
  const controller = () =>
    new BasketOperationController(
      fixture.context,
      client,
      fixture.repository.baskets,
      sessions,
      principal,
      fixture.createId,
    );
  const bootstrap = {
    schemaVersion: 1,
    tenantId: fixture.context.tenant.id,
    currency: 'CHF',
    locale: 'fr',
    timezone: 'Europe/Zurich',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: {},
    capabilities: { ordering: 'enabled' },
  };
  fetcher.mockImplementation((url) =>
    Promise.resolve(
      response({
        success: true,
        data: url.includes('/bootstrap?')
          ? bootstrap
          : basketResponse(customer ? session.userId : null),
      }),
    ),
  );
  return {
    ...fixture,
    client,
    fetcher,
    sessions,
    principal,
    controller,
    subject: controller(),
    bootstrap,
  };
}
