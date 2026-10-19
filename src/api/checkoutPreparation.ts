import { z } from 'zod';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import {
  checkoutIntentSchema,
  orderPayloadHashSchema,
  type CheckoutIntent,
} from './checkoutIntent';
import { checkoutQuoteSchema } from './checkoutQuoteResponse';
import { checkoutQuoteScope, type QuoteRequest } from './checkoutQuoteScope';
const preparationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  payloadHash: orderPayloadHashSchema,
  quote: checkoutQuoteSchema,
});
export async function prepareCustomerOrder(
  client: CustomerTransport,
  context: TenantContext,
  request: QuoteRequest & { intent: CheckoutIntent },
  assertCurrent: () => void,
) {
  const intent = checkoutIntentSchema.parse(request.intent);
  const scope = checkoutQuoteScope(context, request);
  if (JSON.stringify(intent.review) !== JSON.stringify(scope.body))
    throw new ApiFailure(0, 'contract');
  assertCurrent();
  const prepared = await client.request(
    context,
    '/api/customer-mobile/checkout/prepare',
    preparationSchema,
    {
      method: 'POST',
      credentials: 'basket',
      principal: scope.principal,
      expectedBasketSessionId: scope.sessionId,
      body: intent,
      assertCurrent,
      locale: scope.locale,
    },
  );
  assertCurrent();
  const quote = scope.accept(prepared.quote);
  if (
    quote.quoteFingerprint !== intent.expectedQuoteFingerprint ||
    !quote.availablePaymentMethods.includes(intent.paymentMethod)
  )
    throw new ApiFailure(200, 'contract');
  return { intent, payloadHash: prepared.payloadHash, quote };
}
