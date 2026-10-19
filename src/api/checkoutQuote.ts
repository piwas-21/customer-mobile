import type { TenantContext } from '../core/tenantContext';
import type { CustomerTransport } from '../core/transport';
import { checkoutQuoteSchema, type CheckoutQuote } from './checkoutQuoteResponse';
import { checkoutQuoteScope, type QuoteRequest } from './checkoutQuoteScope';
export async function readCheckoutQuote(
  client: CustomerTransport,
  context: TenantContext,
  request: QuoteRequest,
  assertCurrent: () => void,
): Promise<CheckoutQuote> {
  const scope = checkoutQuoteScope(context, request);
  assertCurrent();
  const quote = await client.request(
    context,
    '/api/customer-mobile/checkout/quote',
    checkoutQuoteSchema,
    {
      method: 'POST',
      body: scope.body,
      credentials: 'basket',
      principal: scope.principal,
      expectedBasketSessionId: scope.sessionId,
      assertCurrent,
      locale: scope.locale,
    },
  );
  assertCurrent();
  return scope.accept(quote);
}
