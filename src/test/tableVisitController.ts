import { sessionSetup } from './sessions';
import { tableAccount, tableIdentity } from './tableAccount';
import { response } from './transport';
import { bootstrapSchema } from '../core/capabilities';
import { TableVisitController } from '../core/tableVisitController';
import type { Principal } from '../core/credentials';
import { tenantA, tenantB } from './fixtures';
export async function tableVisitControllerFixture(customer = false) {
  const f = await sessionSetup(customer);
  const principal: Principal = customer
    ? { kind: 'customer', id: tenantA }
    : { kind: 'guest', id: 'basket' };
  const bootstrap = bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'CHF',
    locale: 'fr',
    timezone: 'Europe/Zurich',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: { tableGuestVisitsV1: true },
    capabilities: { 'table-visits': 'enabled' },
  });
  const createId = jest.fn(() => tenantB);
  const controller = () =>
    new TableVisitController(f.context, f.client, f.repository, f.controller, principal, createId);
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.includes('/bootstrap?')
        ? bootstrap
        : url.endsWith('/join')
          ? tableIdentity
          : tableAccount(),
    }),
  );
  const install = () =>
    f.repository.tableVisits.install(f.context, principal, tableIdentity, () => {});
  return {
    ...f,
    principal,
    bootstrap,
    createId,
    actor: controller(),
    actorFactory: controller,
    install,
  };
}
