import { tablePlanFixture } from './tablePlanRepository';
import { TablePlanController } from '../core/tablePlanController';
import { contributionBootstrap } from './tablePayment';
import { payableTableAccount } from './tableContributionReview';
import { response } from './transport';
import { tablePlanPath } from '../core/tablePlanRequest';
import { tablePlanIntentSchema } from '../api/tablePlanIntent';
import { bootstrapSchema } from '../core/capabilities';
import { paymentReadSession } from './tablePaymentAccount';
import { tenantB } from './fixtures';
export async function tablePlanControllerFixture(customer = false) {
  const f = await tablePlanFixture(customer);
  const bootstrap = bootstrapSchema.parse(contributionBootstrap());
  const state = { accepted: false, stopped: false, revision: 7, shifted: false };
  f.fetcher.mockImplementation(async (url, options) => {
    const path = new URL(url).pathname;
    let data: unknown;
    if (path === '/api/tenant/mobile/bootstrap') data = bootstrap;
    else if (path === '/api/customer-mobile/table-payments/account') {
      const account = payableTableAccount();
      account.account.activeEqualSharePlan = null;
      account.account.accountRevision = state.revision;
      if (state.shifted) account.account.availableAllocations[0]!.startOrdinal = 2;
      data = account;
    } else if (path === tablePlanPath + '/prepare') {
      const intent = tablePlanIntentSchema.parse(JSON.parse(options.body!));
      data = {
        ...f.prepared,
        proof: { ...f.prepared.proof, operationId: intent.operationId },
        sharesMinor: intent.customAmountsMinor.length ? intent.customAmountsMinor : [465, 465, 470],
        roundingIncrementMinor: intent.customAmountsMinor.length ? 1 : 5,
      };
    } else if (
      [tablePlanPath + '/submit', tablePlanPath + '/recover', tablePlanPath + '/stop'].includes(
        path,
      )
    ) {
      if (path.endsWith('/submit')) state.accepted = true;
      if (path.endsWith('/stop') && !state.accepted) state.stopped = true;
      data = {
        schemaVersion: 1,
        operationId: tenantB,
        serviceSessionId: f.preparation.intent.serviceSessionId,
        outcome: state.accepted ? 'applied' : state.stopped ? 'stopped' : 'unseen',
        planId: state.accepted ? paymentReadSession : null,
      };
    } else throw new Error('Unexpected native split route');
    return response({ success: true, data });
  });
  f.fetcher.mockClear();
  const actorFactory = () =>
    new TablePlanController(
      f.context,
      f.client,
      f.repository,
      f.sessions,
      f.principal,
      bootstrap,
      () => tenantB,
    );
  return {
    ...f,
    state,
    bootstrap,
    actorFactory,
    actor: actorFactory(),
    choice: { shareCount: 3, customAmountsMinor: [], supersedesPlanId: null },
    paths: () => f.fetcher.mock.calls.map(([url]) => new URL(url).pathname),
  };
}
