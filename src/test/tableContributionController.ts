import { tableContributionFixture } from './tablePaymentRepository';
import { payableTableAccount } from './tableContributionReview';
import {
  contributionBootstrap,
  preparedContribution,
  contributionResolution,
  contributionCheckout,
} from './tablePayment';
import {
  tableContributionPath,
  tableContributionCheckoutPath,
} from '../core/tableContributionRequest';
import { TableContributionController } from '../core/tableContributionController';
import { response } from './transport';
import { tenantB } from './fixtures';
export async function tableContributionControllerFixture(customer = false, custom = false) {
  const f = await tableContributionFixture(customer);
  const bootstrap = contributionBootstrap();
  const hostedUrl = new URL('/original', f.context.tenant.webOrigin).toString();
  const state = {
    accepted: false,
    journal: false,
    paid: false,
    stopped: false,
    unknown: false,
    amount: 1400,
  };
  let prepared = preparedContribution();
  f.fetcher.mockImplementation(async (url, options) => {
    const path = new URL(url).pathname;
    let data: unknown;
    if (path === '/api/tenant/mobile/bootstrap') data = bootstrap;
    else if (path === tableContributionPath + '/account') {
      const account = payableTableAccount(custom);
      if (state.accepted) {
        account.account.accountRevision = 8;
        account.account.availableMinor = 0;
        account.account.availableAllocations = [];
        account.account.reservedMinor = state.amount;
        account.account.activeEqualSharePlan = null;
      }
      data = account;
    } else if (path === tableContributionPath + '/prepare') {
      const intent = JSON.parse(options.body!) as {
        mode: 'Full' | 'Items' | 'Amount' | 'Equal' | 'CustomAmount';
        operationId: string;
      };
      const amount = { Full: 1400, Items: 700, Amount: 350, Equal: 700, CustomAmount: 400 }[
        intent.mode
      ];
      prepared = {
        ...preparedContribution(),
        proof: { ...preparedContribution().proof, operationId: intent.operationId },
        amountMinor: amount,
      };
      Object.assign(prepared, {
        mode: intent.mode,
        allocations:
          intent.mode === 'Full'
            ? prepared.allocations
            : [
                {
                  ...prepared.allocations[0]!,
                  startOrdinal: intent.mode === 'Amount' ? 1 : 2,
                  unitCount: 1,
                  minorPerUnit: amount,
                  amountMinor: amount,
                },
              ],
      });
      data = prepared;
    } else if (
      [
        tableContributionPath + '/submit',
        tableContributionPath + '/recover',
        tableContributionPath + '/stop',
      ].includes(path)
    ) {
      if (path.endsWith('/submit')) {
        state.accepted = true;
        state.amount = prepared.amountMinor;
      }
      if (path.endsWith('/stop') && !state.accepted) state.stopped = true;
      data = state.accepted
        ? contributionResolution()
        : {
            ...contributionResolution(),
            outcome: state.stopped ? 'Stopped' : 'Unseen',
            attemptId: null,
            state: null,
          };
    } else if (path.startsWith(tableContributionCheckoutPath + '/')) {
      if (path.endsWith('/start')) state.journal = true;
      if (path.endsWith('/stop') && !state.unknown && !state.paid) state.stopped = true;
      const outcome = state.paid
        ? 'paid'
        : state.stopped
          ? 'stopped'
          : !state.journal
            ? 'reserved'
            : state.unknown
              ? 'pending'
              : 'ready';
      data = {
        ...contributionCheckout(),
        amountMinor: state.amount,
        outcome,
        expiresAt: state.journal ? contributionCheckout().expiresAt : null,
        checkoutUrl: outcome === 'ready' ? hostedUrl : null,
      };
    } else throw new Error('Unexpected financial route');
    return response({ success: true, data });
  });
  f.fetcher.mockClear();
  const openBrowser = jest.fn<Promise<unknown>, [string]>(async () => ({
    type: 'success',
    claimedPaid: true,
  }));
  const createId = jest.fn(() => tenantB);
  const actorFactory = () =>
    new TableContributionController(
      f.context,
      f.client,
      f.repository,
      f.sessions,
      f.principal,
      bootstrap,
      createId,
      [f.context.tenant.webOrigin],
      openBrowser,
    );
  return {
    ...f,
    state,
    bootstrap,
    hostedUrl,
    openBrowser,
    createId,
    actorFactory,
    actor: actorFactory(),
    paths: () => f.fetcher.mock.calls.map(([url]) => new URL(url).pathname),
  };
}
