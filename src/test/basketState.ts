import type { useBasket } from '../features/basket/BasketProvider';
export function basketState(
  patch: Partial<ReturnType<typeof useBasket>> = {},
): ReturnType<typeof useBasket> {
  return {
    basket: null,
    loading: false,
    unavailable: false,
    hasPending: false,
    canAdd: true,
    failed: false,
    busy: false,
    add: jest.fn(async () => undefined),
    recover: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    ...patch,
  };
}
