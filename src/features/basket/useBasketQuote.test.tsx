import { randomUUID } from 'expo-crypto';
import type { SessionRepository } from '../../core/sessionRepository';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBasket } from './BasketProvider';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
import { existingBasketSession } from '../../test/basketMutations';
import { basketResponse } from '../../test/basketApi';
import { checkoutQuote } from '../../test/checkoutQuote';
import { basketInput, currentBasketOwner } from '../../test/basketOperations';
import { response } from '../../test/transport';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
async function fixture() {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  jest.mocked(randomUUID).mockImplementation(f.createId);
  await existingBasketSession(f);
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.endsWith('/checkout/quote')
        ? checkoutQuote()
        : { ...basketResponse(), orderType: 'Takeaway' },
    }),
  );
  return f;
}
it('connects the current basket owner and bootstrap to a real quote request without changing the basket', async () => {
  const f = await fixture();
  const view = renderHook(useBasket, { wrapper: f.Wrapper });
  await waitFor(() => expect(view.result.current.canAdd).toBe(true));
  const reviewed = view.result.current.basket;
  await expect(view.result.current.quote({ pointsToRedeem: 0, tip: 3 })).resolves.toEqual(
    checkoutQuote(),
  );
  expect(view.result.current.basket).toBe(reviewed);
  const request = f.fetcher.mock.calls.find(([url]) => url.endsWith('/checkout/quote'))!;
  expect(request[1].method).toBe('POST');
  expect(JSON.parse(request[1].body!)).toMatchObject({
    expectedBasketId: reviewed!.id,
    type: 'Takeaway',
  });
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  view.unmount();
  f.cache.clear();
});
it('blocks checkout while a durable basket change still needs recovery', async () => {
  const f = await fixture();
  await f.repository.baskets.prepare(
    f.context,
    f.principal,
    basketInput,
    f.createId,
    currentBasketOwner,
  );
  const view = renderHook(useBasket, { wrapper: f.Wrapper });
  await waitFor(() => expect(view.result.current.hasPending).toBe(true));
  expect(view.result.current.canAdd).toBe(false);
  await expect(view.result.current.quote({ pointsToRedeem: 0, tip: 3 })).rejects.toMatchObject({
    status: 409,
  });
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/checkout/quote'))).toBe(false);
  view.unmount();
  f.cache.clear();
});
it('refuses a previously captured quote action after its owner has logged out', async () => {
  const f = await fixture();
  const view = renderHook(useBasket, { wrapper: f.Wrapper });
  await waitFor(() => expect(view.result.current.canAdd).toBe(true));
  const quote = view.result.current.quote;
  await act(async () => {
    await f.sessions.logout();
  });
  await expect(quote({ pointsToRedeem: 0, tip: 3 })).rejects.toMatchObject({ reason: 'refused' });
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/checkout/quote'))).toBe(false);
  view.unmount();
  f.cache.clear();
});
