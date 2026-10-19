import { bootstrapSchema, canUse, type Bootstrap } from '../core/capabilities';
import { principalSchema, type Principal } from '../core/credentials';
import { canonicalUuidSchema } from '../core/identifiers';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure } from '../core/transport';
import type { CustomerBasket } from './basketResponse';
import { assertOwnedBasket } from './basketOwnership';
import type { CheckoutQuote } from './checkoutQuoteResponse';
import { checkoutReviewSchema } from './checkoutReview';
export type QuoteRequest = Readonly<{
  principal: Principal;
  sessionId: string;
  reviewed: CustomerBasket;
  bootstrap: Bootstrap;
  pointsToRedeem: number;
  tip: number;
  locale: string;
}>;
// Snapshot identity and requested rows before any credential or transport await.
export function checkoutQuoteScope(context: TenantContext, request: QuoteRequest) {
  const owner = Object.freeze(principalSchema.parse(request.principal));
  const sessionId = canonicalUuidSchema.parse(request.sessionId);
  const bootstrap = bootstrapSchema.parse(request.bootstrap);
  assertOwnedBasket(request.reviewed, owner, sessionId);
  const body = checkoutReviewSchema.parse({
    schemaVersion: 1,
    expectedBasketId: request.reviewed.id,
    expectedPurchaseFingerprint: request.reviewed.purchaseFingerprint,
    type: request.reviewed.orderType,
    pointsToRedeem: request.pointsToRedeem,
    tip: request.tip,
  });
  if (
    bootstrap.tenantId !== context.tenant.id ||
    !canUse(bootstrap, 'ordering') ||
    !bootstrap.currency ||
    !request.reviewed.items.length ||
    (body.pointsToRedeem > 0 && (owner.kind !== 'customer' || !canUse(bootstrap, 'loyalty')))
  )
    throw new ApiFailure(0, 'contract');
  const currency = bootstrap.currency;
  const online = canUse(bootstrap, 'online-payments');
  const roots = new Map(
    request.reviewed.items.map((row) => [
      canonicalUuidSchema.parse(row.id),
      {
        productId: row.productId ?? null,
        menuId: row.menuId ?? null,
        variationId: row.productVariationId ?? null,
        quantity: row.quantity,
        instructions: row.specialInstructions ?? null,
      },
    ]),
  );
  if (roots.size !== request.reviewed.items.length) throw new ApiFailure(0, 'contract');
  return {
    principal: owner,
    sessionId,
    body,
    locale: request.locale,
    accept(quote: CheckoutQuote): CheckoutQuote {
      if (
        quote.basketId !== body.expectedBasketId ||
        quote.purchaseFingerprint !== body.expectedPurchaseFingerprint ||
        quote.type !== body.type ||
        quote.currency !== currency ||
        quote.money.tip !== body.tip ||
        quote.money.pointsRedeemed > body.pointsToRedeem ||
        (quote.money.pointsRedeemed === 0 && quote.money.pointsDiscount !== 0) ||
        quote.items.length !== roots.size ||
        !quote.availablePaymentMethods.includes('Cash') ||
        quote.availablePaymentMethods.includes('CreditCard') !== (body.type === 'Takeaway') ||
        (!online && quote.availablePaymentMethods.includes('OnlinePayment')) ||
        quote.items.some((row) => {
          const reviewed = roots.get(row.basketItemId!);
          return (
            (row.productId ?? null) !== reviewed?.productId ||
            (row.menuId ?? null) !== reviewed?.menuId ||
            (row.productVariationId ?? null) !== reviewed?.variationId ||
            row.quantity !== reviewed?.quantity ||
            (row.specialInstructions ?? null) !== reviewed?.instructions
          );
        })
      )
        throw new ApiFailure(200, 'contract');
      return quote;
    },
  };
}
