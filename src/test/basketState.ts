import type { useBasket } from '../features/basket/BasketProvider';
export function basketState(
  patch: Partial<ReturnType<typeof useBasket>> = {},
): ReturnType<typeof useBasket> {
  return {
    basket: null,
    loading: false,
    unavailable: false,
    revision: ['staging', undefined, 'guest:basket', 'basket', 0, 'fixture-owner', 1],
    hasPending: false,
    cancelling: false,
    resolution: null,
    canAdd: true,
    failed: false,
    busy: false,
    add: jest.fn(async () => undefined),
    mutate: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
    recover: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    ...patch,
  };
}
