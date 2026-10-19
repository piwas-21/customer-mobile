import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { SessionRepository } from '../../core/sessionRepository';
import { useBasket } from './BasketProvider';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
import { existingBasketSession } from '../../test/basketMutations';
import { basketInput, basketOperationId, currentBasketOwner } from '../../test/basketOperations';
import { checkoutIntent, appliedOrder } from '../../test/customerOrder';
import { checkoutQuote } from '../../test/checkoutQuote';
import { basketResponse } from '../../test/basketApi';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
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
async function configuration() {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  jest.mocked(randomUUID).mockReturnValue(basketOperationId);
  await existingBasketSession(f);
  f.fetcher.mockImplementation(async (url) =>
    response({
      success: true,
      data: url.endsWith('/prepare')
        ? { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() }
        : { ...basketResponse(), orderType: 'Takeaway' },
    }),
  );
  return f;
}
async function fixture() {
  const f = await configuration();
  const view = renderHook(useBasket, { wrapper: f.Wrapper });
  await waitFor(() => expect(view.result.current.canAdd).toBe(true));
  return {
    ...f,
    view,
    close: () => {
      view.unmount();
      f.cache.clear();
    },
  };
}
it('connects one native acceptance, blocks competing basket actions and publishes only the validated decision', async () => {
  const f = await fixture();
  const submitted = deferred<void>();
  const reply = deferred<Response>();
  const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) {
      submitted.resolve();
      return reply.promise;
    }
    return original(url, options);
  });
  try {
    await act(async () => {
      const pending = f.view.result.current.placeOrder(checkoutIntent());
      await submitted.promise;
      await expect(f.view.result.current.add(basketInput)).rejects.toMatchObject({ status: 409 });
      reply.resolve(response({ success: true, data: appliedOrder() }));
      await pending;
    });
    expect(f.view.result.current.orderDecision).toEqual(appliedOrder());
    expect(f.view.result.current.pendingOrder).toBeNull();
    expect(await f.repository.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
    expect(
      await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner),
    ).toHaveLength(1);
  } finally {
    f.close();
  }
});
it('restores an unknown order hold and recovery never resends the original order or permits another basket change', async () => {
  const f = await fixture();
  const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) throw new Error('Response lost');
    return original(url, options);
  });
  try {
    await act(async () => {
      await expect(f.view.result.current.placeOrder(checkoutIntent())).rejects.toThrow();
    });
    expect(f.view.result.current.pendingOrder).toEqual({
      cancelling: false,
      canResume: true,
      cleanupPending: false,
    });
    expect(f.view.result.current.canAdd).toBe(false);
    await expect(f.view.result.current.add(basketInput)).rejects.toMatchObject({ status: 409 });
    f.fetcher.mockImplementation(async (url, options) =>
      url.endsWith('/recover')
        ? response({ success: true, data: { ...appliedOrder(), outcome: 'Unseen', orderId: null } })
        : original(url, options),
    );
    await act(async () => {
      await f.view.result.current.recoverOrder();
    });
    expect(f.view.result.current.pendingOrder).not.toBeNull();
    expect(f.view.result.current.orderDecision?.outcome).toBe('Unseen');
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
  } finally {
    f.close();
  }
});
it('finishes explicit cancellation and refreshes current basket without retaining contact in query state', async () => {
  const f = await fixture();
  await f.repository.orders.prepare(
    f.context,
    f.principal,
    { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) },
    () => basketOperationId,
    currentBasketOwner,
  );
  try {
    await act(async () => {
      await f.view.result.current.refresh();
    });
    expect(f.view.result.current.canAdd).toBe(false);
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) =>
      url.endsWith('/cancel')
        ? response({
            success: true,
            data: { ...appliedOrder(), outcome: 'Cancelled', orderId: null },
          })
        : original(url, options),
    );
    await act(async () => {
      await f.view.result.current.cancelOrder();
    });
    await waitFor(() => expect(f.view.result.current.canAdd).toBe(true));
    expect(f.view.result.current.pendingOrder).toBeNull();
    expect(f.view.result.current.orderDecision?.outcome).toBe('Cancelled');
    const publicState = f.cache
      .getQueryCache()
      .getAll()
      .map((value) => value.state.data);
    expect(JSON.stringify(publicState)).not.toContain('native@example.test');
    expect(JSON.stringify(publicState)).not.toContain('payloadHash');
  } finally {
    f.close();
  }
});
it('a preparation failure creates no durable order and explicit refresh restores the current basket', async () => {
  const f = await fixture();
  const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) =>
    url.endsWith('/prepare') ? response({}, 409) : original(url, options),
  );
  try {
    await act(async () => {
      await expect(f.view.result.current.placeOrder(checkoutIntent())).rejects.toThrow();
    });
    expect(f.view.result.current.failed).toBe(true);
    expect(f.view.result.current.pendingOrder).toBeNull();
    await act(async () => {
      await f.view.result.current.refresh();
    });
    await waitFor(() => expect(f.view.result.current.failed).toBe(false));
    expect(await f.repository.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  } finally {
    f.close();
  }
});
