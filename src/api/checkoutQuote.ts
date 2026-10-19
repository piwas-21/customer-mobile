import { z } from 'zod';
import { bootstrapSchema, canUse, type Bootstrap } from '../core/capabilities';
import { principalSchema, type Principal } from '../core/credentials';
import { canonicalUuidSchema } from '../core/identifiers';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { CustomerBasket } from './basketResponse';
import { assertOwnedBasket } from './basketOwnership';
import { checkoutMoney } from './checkoutMoney';
import {
  checkoutChannelSchema,
  checkoutFingerprintSchema,
  checkoutQuoteSchema,
  type CheckoutQuote,
} from './checkoutQuoteResponse';
const reviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedBasketId: canonicalUuidSchema,
  expectedPurchaseFingerprint: checkoutFingerprintSchema,
  type: checkoutChannelSchema,
  pointsToRedeem: z.int32().nonnegative(),
  tip: checkoutMoney,
});
type QuoteRequest = Readonly<{
  principal: Principal;
  sessionId: string;
  reviewed: CustomerBasket;
  bootstrap: Bootstrap;
  pointsToRedeem: number;
  tip: number;
  locale: string;
}>;
export async function readCheckoutQuote(
  client: CustomerTransport,
  context: TenantContext,
  request: QuoteRequest,
  assertCurrent: () => void,
): Promise<CheckoutQuote> {
  const owner = Object.freeze(principalSchema.parse(request.principal));
  const sessionId = canonicalUuidSchema.parse(request.sessionId);
  const bootstrap = bootstrapSchema.parse(request.bootstrap);
  assertOwnedBasket(request.reviewed, owner, sessionId);
  const body = reviewSchema.parse({
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
  assertCurrent();
  const quote = await client.request(
    context,
    '/api/customer-mobile/checkout/quote',
    checkoutQuoteSchema,
    {
      method: 'POST',
      body,
      credentials: 'basket',
      principal: owner,
      expectedBasketSessionId: sessionId,
      assertCurrent,
      locale: request.locale,
    },
  );
  assertCurrent();
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
        !reviewed ||
        (row.productId ?? null) !== reviewed.productId ||
        (row.menuId ?? null) !== reviewed.menuId ||
        (row.productVariationId ?? null) !== reviewed.variationId ||
        row.quantity !== reviewed.quantity ||
        (row.specialInstructions ?? null) !== reviewed.instructions
      );
    })
  )
    throw new ApiFailure(200, 'contract');
  return quote;
}
