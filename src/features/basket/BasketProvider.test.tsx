import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SessionRepository } from '../../core/sessionRepository';
import { randomUUID } from 'expo-crypto';
import { useBasket } from './BasketProvider';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
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
afterEach(() => jest.restoreAllMocks());
async function setup(pending = false) {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  jest.mocked(randomUUID).mockImplementation(f.createId);
  if (pending)
    await f.repository.baskets.prepare(
      f.context,
      f.principal,
      basketInput,
      f.createId,
      currentBasketOwner,
    );
  const hook = renderHook(() => useBasket(), { wrapper: f.Wrapper });
  await waitFor(() =>
    expect(hook.result.current.canAdd || hook.result.current.hasPending).toBe(true),
  );
  return {
    ...f,
    hook,
    close() {
      hook.unmount();
      f.cache.clear();
    },
  };
}
it('does not submit or create a session while opening an empty basket', async () => {
  const f = await setup();
  try {
    await waitFor(() => expect(f.hook.result.current.basket).toBeNull());
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.store.values.size).toBe(0);
  } finally {
    f.close();
  }
});
it('keeps a restored operation blocked after the ordinary GET and recovers only on demand', async () => {
  const f = await setup(true);
  try {
    await waitFor(() => expect(f.hook.result.current.basket?.totalItems).toBe(2));
    expect(f.hook.result.current.canAdd).toBe(false);
    expect(f.fetcher.mock.calls.every(([, request]) => request.method !== 'POST')).toBe(true);
    await act(async () => {
      await f.hook.result.current.recover();
    });
    expect(f.hook.result.current.hasPending).toBe(false);
    expect(f.hook.result.current.canAdd).toBe(true);
    expect(f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
    expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  } finally {
    f.close();
  }
});
it('retains an unknown add outcome and prevents a second tap or later add from posting it again', async () => {
  const f = await setup();
  f.fetcher.mockImplementation(async (url) =>
    response(
      { success: true, data: url.includes('bootstrap') ? f.bootstrap : {} },
      url.includes('bootstrap') ? 200 : 503,
    ),
  );
  try {
    await act(async () => {
      const first = f.hook.result.current.add(basketInput);
      await expect(f.hook.result.current.add(basketInput)).rejects.toMatchObject({ status: 409 });
      await expect(first).rejects.toMatchObject({ status: 503 });
    });
    expect(f.hook.result.current.hasPending).toBe(true);
    expect(f.hook.result.current.canAdd).toBe(false);
    expect(f.hook.result.current.failed).toBe(true);
    const count = f.fetcher.mock.calls.length;
    await expect(f.hook.result.current.add(basketInput)).rejects.toMatchObject({ status: 409 });
    expect(f.fetcher.mock.calls).toHaveLength(count);
  } finally {
    f.close();
  }
});
it('holds writes when restoring the secure operation journal fails', async () => {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  jest
    .spyOn(f.repository.baskets, 'load')
    .mockRejectedValue(new Error('Secure storage unavailable'));
  const hook = renderHook(() => useBasket(), { wrapper: f.Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.failed).toBe(true));
    expect(hook.result.current.canAdd).toBe(false);
    await expect(hook.result.current.add(basketInput)).rejects.toMatchObject({ status: 409 });
    expect(f.fetcher).not.toHaveBeenCalled();
  } finally {
    hook.unmount();
    f.cache.clear();
  }
});
