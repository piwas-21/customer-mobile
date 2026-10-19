import { CustomerTransport, type Fetch } from '../core/transport';
import type { Principal } from '../core/credentials';
import {
  basketOperationsFixture,
  basketPrincipal,
  basketInput,
  currentBasketOwner,
} from './basketOperations';
import { tenantA, tenantB } from './fixtures';
export function basketResponse(userId: string | null = null) {
  return {
    id: tenantB,
    userId,
    sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    subTotal: 14,
    tax: 1.2,
    deliveryFee: 2,
    discount: 0,
    customerDiscount: 0,
    total: 17.2,
    totalItems: 2,
    orderType: null,
    purchaseFingerprint: 'A'.repeat(64),
    items: [
      {
        id: tenantA,
        productId: tenantA,
        productName: 'Meal',
        quantity: 2,
        unitPrice: 7,
        itemTotal: 14,
        customizationPrice: 0,
        childItems: [],
        removedIngredientNames: ['Onion'],
      },
    ],
  };
}
export async function basketApiFixture(principal: Principal = basketPrincipal) {
  const fixture = basketOperationsFixture();
  const pending = await fixture.repository.baskets.prepare(
    fixture.context,
    principal,
    basketInput,
    fixture.createId,
    currentBasketOwner,
  );
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(fixture.boundary, fixture.repository.vault, fetcher);
  return { ...fixture, principal, pending, fetcher, client };
}
