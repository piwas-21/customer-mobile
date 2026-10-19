import '../../i18n';
import { useEffect, type PropsWithChildren } from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import OrdersScreen from './OrdersScreen';
import useOrderReceipts from './useOrderReceipts';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { savedOrderFixture, receiptResponse } from '../../test/orderReceipt';
import { response } from '../../test/transport';
import type { SessionRepository } from '../../core/sessionRepository';
import { basketOperationId } from '../../test/basketOperations';
import { deferred } from '../../test/deferred';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
async function fixture(customer = false) {
  const f = await savedOrderFixture(customer);
  mockRepository = f.repository;
  jest.mocked(useFocusEffect).mockImplementation(useEffect);
  const state = {
    controller: f.sessions,
    userId: f.sessions.userId,
    ownerVersion: f.sessions.ownerVersion,
    needsCleanup: false,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  };
  jest.mocked(useSession).mockReturnValue(state);
  jest.mocked(useRestaurant).mockReturnValue({
    context: f.context,
    client: f.client,
    directory: undefined,
    loading: false,
    select: jest.fn(),
    clear: jest.fn(),
    refresh: jest.fn(),
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
  }
  f.fetcher.mockResolvedValue(response({ success: true, data: receiptResponse() }));
  return { ...f, state, cache, Wrapper };
}
it('opens one saved receipt with distinct unpaid status and requires confirmation before local removal', async () => {
  const f = await fixture();
  const view = render(<OrdersScreen />, { wrapper: f.Wrapper });
  try {
    const open = await view.findByRole('button', { name: /Saved on this device/ });
    expect(f.fetcher).not.toHaveBeenCalled();
    fireEvent.press(open);
    await view.findByText('Order 20261019-001');
    expect(view.getByText('Preparing')).toBeTruthy();
    expect(view.getByText('Payment pending')).toBeTruthy();
    expect(view.queryByText('Paid')).toBeNull();
    expect(view.getByText('Times shown in Europe/Zurich.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Remove from this device' }));
    expect(view.getByText(/It does not cancel your order or refund a payment/)).toBeTruthy();
    expect(view.queryByText('No orders are saved on this device yet.')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Keep saved order' }));
    expect(view.queryByText(/It does not cancel/)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Remove from this device' }));
    fireEvent.press(view.getByRole('button', { name: 'Yes, remove from device' }));
    await view.findByText('No orders are saved on this device yet.');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('20261019-001');
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('does not recreate an old private receipt after logout while its HTTP response is pending', async () => {
  const f = await fixture(true);
  const reply = deferred<Response>();
  const dispatched = deferred<void>();
  f.fetcher.mockImplementation(() => {
    dispatched.resolve();
    return reply.promise;
  });
  const hook = renderHook(useOrderReceipts, { wrapper: f.Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    act(() => hook.result.current.select(basketOperationId));
    await act(async () => {
      await dispatched.promise;
    });
    await act(async () => {
      await f.sessions.logout();
    });
    jest
      .mocked(useSession)
      .mockReturnValue({ ...f.state, userId: null, ownerVersion: f.sessions.ownerVersion });
    hook.rerender({});
    await act(async () => {
      reply.resolve(response({ success: true, data: receiptResponse() }));
    });
    await waitFor(() => expect(hook.result.current.items).toEqual([]));
    expect(hook.result.current.receipt).toBeUndefined();
    expect(
      JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('20261019-001');
  } finally {
    hook.unmount();
    f.cache.clear();
  }
});
it('keeps device cleanup retry accessible when no receipt owner can be constructed', async () => {
  const f = await fixture(true);
  jest
    .mocked(useSession)
    .mockReturnValue({ ...f.state, userId: null, needsCleanup: true, unavailable: true });
  const logout = jest.spyOn(f.sessions, 'logout').mockResolvedValue();
  const view = render(<OrdersScreen />, { wrapper: f.Wrapper });
  try {
    await view.findByText(
      'Sign-out could not be completed on this device. Please try again before leaving it.',
    );
    fireEvent.press(view.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(view.queryByRole('button', { name: /Saved on this device/ })).toBeNull();
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
