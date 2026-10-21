import type { TableRoundRecord } from '../core/tableRoundRecord';
import type { TableRoundResolution } from '../api/tableRoundContract';
import { bootstrapSchema } from '../core/capabilities';
import { tableRoundReview } from '../api/tableRoundReview';
import { tableAccount, tableIdentity } from './tableAccount';
import { checkoutQuoteFixture } from './checkoutQuote';
import { preparedRound } from './tableRound';
import { tenantB } from './fixtures';

export const roundGuard = () => {};
export async function tableRoundFixture(customer = false) {
  const f = await checkoutQuoteFixture(customer);
  const visit = await f.repository.tableVisits.install(
    f.context,
    f.principal,
    tableIdentity,
    roundGuard,
  );
  const request = {
    principal: f.principal,
    sessionId: f.request.sessionId,
    basket: { ...f.request.reviewed, orderType: 'DineIn' as const },
    account: tableAccount(),
    bootstrap: bootstrapSchema.parse({
      ...f.request.bootstrap,
      flags: { tableGuestVisitsV1: true },
      capabilities: {
        ...f.request.bootstrap.capabilities,
        'table-visits': 'enabled',
        accounts: 'enabled',
      },
    }),
    visit,
    operationId: tenantB,
  };
  const review = tableRoundReview(f.context, request);
  const prepared = review.accept(preparedRound());
  const install = () =>
    f.repository.tableRounds.install(f.context, review.preparation, prepared, roundGuard);
  return { ...f, request, review, prepared, install };
}

export function roundOutcome(record: TableRoundRecord, applied = false): TableRoundResolution {
  const scope = {
    schemaVersion: 1 as const,
    operationId: record.intent.operationId,
    serviceSessionId: record.intent.serviceSessionId,
  };
  return applied
    ? { ...scope, outcome: 'Applied', orderId: tenantB }
    : { ...scope, outcome: 'Cancelled', orderId: null };
}
