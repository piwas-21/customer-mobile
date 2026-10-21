import { checkoutRootBinding } from './checkoutRootBinding';
import { assertOwnedBasket } from './basketOwnership';
import type { CustomerBasket } from './basketResponse';
import { tableAccountSchema } from './tableAccountContract';
import { bindPreparedTableRound } from './tableRoundContract';
import type { Bootstrap } from '../core/capabilities';
import { requireTableRoundEnabled } from '../core/tableRoundPolicy';
import type { Principal } from '../core/credentials';
import { ApiFailure } from '../core/apiFailure';
import { scopedRoundPreparation } from '../core/tableRoundPreparation';
import type { TableVisitRecord } from '../core/tableVisitRecord';
import type { TenantContext } from '../core/tenantContext';

// A private volatile review snapshot. Neither participant nor original proof belongs in Query data.
export function tableRoundReview(
  context: TenantContext,
  request: {
    principal: Principal;
    sessionId: string;
    visit: TableVisitRecord;
    account: unknown;
    basket: CustomerBasket;
    bootstrap: Bootstrap;
    operationId: string;
  },
) {
  const bootstrap = requireTableRoundEnabled(context, request.bootstrap, request.principal);
  const account = tableAccountSchema.parse(request.account);
  const basket = request.basket;
  assertOwnedBasket(basket, request.principal, request.sessionId);
  if (
    account.currency !== bootstrap.currency ||
    account.serviceSessionId !== request.visit.identity.serviceSessionId ||
    basket.orderType !== 'DineIn' ||
    !basket.items.length
  )
    throw new ApiFailure(409, 'refused');
  const preparation = scopedRoundPreparation(context, request.principal, {
    schemaVersion: 1,
    environment: context.environment,
    tenantId: context.tenant.id,
    principal: request.principal,
    sessionId: request.sessionId,
    visit: request.visit,
    currency: bootstrap.currency,
    intent: {
      schemaVersion: 1,
      operationId: request.operationId,
      tenantId: context.tenant.id,
      serviceSessionId: account.serviceSessionId,
      expectedAccountRevision: account.accountRevision,
      expectedBasketId: basket.id,
      expectedPurchaseFingerprint: basket.purchaseFingerprint,
    },
  });
  const assertRoots = checkoutRootBinding(basket);
  return {
    preparation,
    accept(value: unknown) {
      const prepared = bindPreparedTableRound(preparation.intent, preparation.currency, value);
      assertRoots(prepared.quote.items);
      return prepared;
    },
  };
}
