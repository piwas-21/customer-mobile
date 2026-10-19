import { checkoutQuote } from './checkoutQuote';
import { emptyUuid } from '../core/identifiers';
import type { useBasket } from '../features/basket/BasketProvider';
export function basketState(
  patch: Partial<ReturnType<typeof useBasket>> = {},
): ReturnType<typeof useBasket> {
  return {
    canContinueAsGuest: false,
    continueAsGuest: jest.fn(async () => {}),
    basket: null,
    loading: false,
    unavailable: false,
    revision: ['staging', undefined, 'guest:basket', 'basket', 0, 'fixture-owner', 1],
    hasPending: false,
    pendingOrder: null,
    orderDecision: null,
    recoverOrder: jest.fn(async () => ({
      schemaVersion: 1 as const,
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      outcome: 'Unseen' as const,
      orderId: null,
    })),
    cancelOrder: jest.fn(async () => ({
      schemaVersion: 1 as const,
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      outcome: 'Cancelled' as const,
      orderId: null,
    })),
    placeOrder: jest.fn(async () => ({
      schemaVersion: 1 as const,
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      outcome: 'Applied' as const,
      orderId: checkoutQuote().basketId,
    })),
    cancelling: false,
    resolution: null,
    canAdd: true,
    failed: false,
    busy: false,
    add: jest.fn(async () => undefined),
    mutate: jest.fn(async () => undefined),
    changeChannel: jest.fn(async () => undefined),
    quote: jest.fn(async () => checkoutQuote()),
    previewChannel: jest.fn(async (orderType) => ({
      basketId: emptyUuid,
      purchaseFingerprint: '',
      orderType,
      conflicts: [],
    })),
    cancel: jest.fn(async () => undefined),
    recover: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    ...patch,
  };
}
