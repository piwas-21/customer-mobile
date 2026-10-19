import { act, waitFor } from '@testing-library/react-native';
import type { SessionRepository } from '../../core/sessionRepository';
import { basketProviderFixture } from '../../test/basketProvider';
import { currentBasketOwner } from '../../test/basketOperations';
import { basketMutation } from '../../test/basketMutations';
import { basketResponse } from '../../test/basketApi';
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
const setup = (pending = false, cancelling = false) =>
  basketProviderFixture(
    (repository) => {
      mockRepository = repository;
    },
    pending,
    cancelling,
  );
it('runs reviewed root edits through the real workspace and updates only from server readback', async () => {
  const f = await setup();
  const revised = { ...basketResponse(), total: 42, totalItems: 3 };
  f.fetcher.mockImplementation(async (url) =>
    response({ success: true, data: url.includes('bootstrap') ? f.bootstrap : revised }),
  );
  try {
    await act(async () => {
      await f.hook.result.current.mutate(basketMutation());
    });
    expect(f.hook.result.current.basket?.total).toBe(42);
    expect(f.hook.result.current.hasPending).toBe(false);
    const post = f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0]?.[0]).toContain(`/items/${basketMutation().basketItemId}/operations`);
    expect(JSON.parse(String(post[0]?.[1].body))).toEqual(
      expect.objectContaining({
        action: 'Update',
        quantity: 3,
        specialInstructions: 'Keep this note',
        expectedBasketId: basketResponse().id,
        expectedPurchaseFingerprint: 'A'.repeat(64),
      }),
    );
  } finally {
    f.close();
  }
});
it('seals an earlier request, hides the old quote, and reads the current basket before another change', async () => {
  const f = await setup(true);
  let completeRead!: () => void;
  f.fetcher.mockImplementation(async (url, request) => {
    if (url.includes('/cancel'))
      return response({
        success: true,
        data: {
          operationId: JSON.parse(String(request.body)).operationId,
          outcome: 'Cancelled',
        },
      });
    if (url.includes('bootstrap')) return response({ success: true, data: f.bootstrap });
    await new Promise<void>((resolve) => {
      completeRead = resolve;
    });
    return response({
      success: true,
      data: { ...basketResponse(), items: [], totalItems: 0, total: 0 },
    });
  });
  try {
    await act(async () => {
      await f.hook.result.current.cancel();
    });
    await waitFor(() => expect(completeRead).toBeDefined());
    expect(f.hook.result.current.resolution).toBe('Cancelled');
    expect(f.hook.result.current.basket).toBeUndefined();
    expect(f.hook.result.current.hasPending).toBe(false);
    expect(f.hook.result.current.canAdd).toBe(false);
    await act(async () => completeRead());
    await waitFor(() => expect(f.hook.result.current.basket?.total).toBe(0));
    expect(f.hook.result.current.canAdd).toBe(true);
    expect(f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
  } finally {
    f.close();
  }
});
it('reports an already applied change and uses its validated basket without another execution', async () => {
  const f = await setup(true);
  f.fetcher.mockImplementation(async (_url, request) =>
    response({
      success: true,
      data: {
        operationId: JSON.parse(String(request.body)).operationId,
        outcome: 'Applied',
        basket: { ...basketResponse(), total: 28 },
      },
    }),
  );
  try {
    await act(async () => {
      await f.hook.result.current.cancel();
    });
    expect(f.hook.result.current.resolution).toBe('Applied');
    expect(f.hook.result.current.basket?.total).toBe(28);
    expect(f.hook.result.current.canAdd).toBe(true);
    expect(f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
  } finally {
    f.close();
  }
});
it('retains a restored cancellation and refuses original execution without exposing its private payload in query state', async () => {
  const f = await setup(true, true);
  try {
    expect(f.hook.result.current.cancelling).toBe(true);
    const count = f.fetcher.mock.calls.length;
    await expect(f.hook.result.current.recover()).rejects.toMatchObject({ status: 409 });
    expect(f.fetcher.mock.calls).toHaveLength(count);
    const pending = f.cache
      .getQueryCache()
      .getAll()
      .find((query) => query.queryKey.at(-1) === 'pending');
    expect(pending?.state.data).toEqual({ kind: 'add', cancelling: true });
  } finally {
    f.close();
  }
});
it('keeps cancellation as the only recovery after an unknown server response', async () => {
  const f = await setup(true);
  f.fetcher.mockImplementation(async (url) =>
    response(
      { success: true, data: url.includes('bootstrap') ? f.bootstrap : {} },
      url.includes('bootstrap') ? 200 : 503,
    ),
  );
  try {
    await act(async () => {
      await expect(f.hook.result.current.cancel()).rejects.toMatchObject({ status: 503 });
    });
    expect(f.hook.result.current.hasPending).toBe(true);
    expect(f.hook.result.current.cancelling).toBe(true);
    expect(f.hook.result.current.canAdd).toBe(false);
    const count = f.fetcher.mock.calls.length;
    await expect(f.hook.result.current.recover()).rejects.toMatchObject({ status: 409 });
    expect(f.fetcher.mock.calls).toHaveLength(count);
    expect(
      (await f.repository.baskets.load(f.context, f.principal, currentBasketOwner))
        ?.cancellationRequested,
    ).toBe(true);
  } finally {
    f.close();
  }
});
it('refuses an edit when the reviewed basket read has failed, even if old data is cached', async () => {
  const f = await setup();
  f.fetcher.mockImplementation(async (url) =>
    response(
      { success: true, data: url.includes('bootstrap') ? f.bootstrap : {} },
      url.includes('bootstrap') ? 200 : 503,
    ),
  );
  try {
    act(() => {
      void f.hook.result.current.refresh();
    });
    await waitFor(() => expect(f.hook.result.current.failed).toBe(true));
    expect(f.hook.result.current.canAdd).toBe(false);
    const count = f.fetcher.mock.calls.length;
    await expect(f.hook.result.current.mutate(basketMutation())).rejects.toMatchObject({
      status: 409,
    });
    expect(f.fetcher.mock.calls).toHaveLength(count);
    expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  } finally {
    f.close();
  }
});
