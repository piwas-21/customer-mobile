import { tableRoundFixture, roundGuard } from './tableRoundRepository';
import { TableRoundController } from '../core/tableRoundController';
import { tableRoundPath } from '../core/tableRoundRequest';
import { response } from './transport';
import { tenantB } from './fixtures';

export async function tableRoundControllerFixture(customer = false) {
  const f = await tableRoundFixture(customer);
  const createId = jest.fn(() => tenantB);
  const controller = () =>
    new TableRoundController(
      f.context,
      f.client,
      f.repository,
      f.sessions,
      f.principal,
      f.request.bootstrap,
      createId,
    );
  f.fetcher.mockImplementation(async (url, options) => {
    const path = new URL(url).pathname;
    let data: unknown;
    if (path === '/api/tenant/mobile/bootstrap') data = f.request.bootstrap;
    else if (path === '/api/customer-mobile/basket') data = f.request.basket;
    else if (path.endsWith('/account')) data = f.request.account;
    else if (path === tableRoundPath + '/prepare') {
      const intent = JSON.parse(options.body!) as { operationId: string };
      data = { ...f.prepared, proof: { ...f.prepared.proof, operationId: intent.operationId } };
    } else {
      const proof = JSON.parse(options.body!) as { operationId: string };
      data = {
        schemaVersion: 1,
        operationId: proof.operationId,
        serviceSessionId: f.request.account.serviceSessionId,
        outcome: 'Applied',
        orderId: tenantB,
      };
    }
    return response({ success: true, data });
  });
  f.fetcher.mockClear();
  return { ...f, guard: roundGuard, createId, actor: controller(), actorFactory: controller };
}
