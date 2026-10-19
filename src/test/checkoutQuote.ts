import type { CheckoutLine } from '../api/checkoutComposition';
import type { CheckoutQuote } from '../api/checkoutQuoteResponse';
import type { CustomerBasket } from '../api/basketResponse';
import { bootstrapSchema } from '../core/capabilities';
import { basketControllerFixture } from './basketController';
import { basketResponse } from './basketApi';
import { existingBasketSession } from './basketMutations';
import { tenantA } from './fixtures';
export function checkoutLine(): CheckoutLine {
  return {
    basketItemId: tenantA,
    productId: tenantA,
    name: 'Meal',
    quantity: 2,
    unitPrice: 7,
    itemTotal: 14,
    quantityBasis: 'LineTotal',
    configurationScope: 'Unknown',
    compositionRole: 'Dish',
    ingredients: [],
    children: [],
  };
}
export function checkoutQuote(): CheckoutQuote {
  return {
    schemaVersion: 1,
    basketId: basketResponse().id,
    purchaseFingerprint: basketResponse().purchaseFingerprint,
    quoteFingerprint: 'b'.repeat(64),
    type: 'Takeaway',
    currency: 'CHF',
    priceChanged: false,
    money: {
      subTotal: 14,
      tax: 0,
      deliveryFee: 0,
      discount: 0,
      customerDiscount: 0,
      pointsDiscount: 0,
      pointsRedeemed: 0,
      tip: 3,
      total: 17,
    },
    items: [checkoutLine()],
    availablePaymentMethods: ['Cash', 'CreditCard'],
  };
}
export async function checkoutQuoteFixture(customer = false) {
  const fixture = await basketControllerFixture(customer);
  await existingBasketSession(fixture);
  if (customer)
    await fixture.repository.vault.saveCapability(
      fixture.context,
      'guest-session',
      fixture.principal,
      basketResponse().sessionId,
    );
  const reviewed: CustomerBasket = {
    ...basketResponse(customer ? fixture.principal.id : null),
    orderType: 'Takeaway',
  };
  return {
    ...fixture,
    request: {
      principal: fixture.principal,
      sessionId: reviewed.sessionId,
      reviewed,
      bootstrap: bootstrapSchema.parse(fixture.bootstrap),
      pointsToRedeem: 0,
      tip: 3,
      locale: 'en',
    },
  };
}
