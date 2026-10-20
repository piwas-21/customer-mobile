import '../../i18n';
import { type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { openBrowserAsync, WebBrowserResultType } from 'expo-web-browser';
import PaymentProvider from './PaymentProvider';
import PaymentNotice from './PaymentNotice';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { paymentControllerFixture, paymentReply } from '../../test/paymentController';
import { deferred } from '../../test/deferred';
import { response } from '../../test/transport';
import type { SessionRepository } from '../../core/sessionRepository';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('../../config', () => ({
  runtimeConfig: { hostedCheckoutOrigins: ['https://checkout.example.test'] },
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel' },
}));
async function setup() {
  const f = await paymentControllerFixture();
  mockRepository = f.repository;
  jest.mocked(useSession).mockReturnValue({
    controller: f.sessions,
    userId: null,
    ownerVersion: f.sessions.ownerVersion,
    needsCleanup: false,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  });
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
    return (
      <QueryClientProvider client={cache}>
        <PaymentProvider>{children}</PaymentProvider>
      </QueryClientProvider>
    );
  }
  return { ...f, cache, Wrapper };
}
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-20T11:00:00Z'));
  jest.mocked(openBrowserAsync).mockReset();
});
afterEach(() => jest.restoreAllMocks());
it('restores a pending original payment after restart without offering another charge', async () => {
  const f = await setup();
  f.fetcher.mockResolvedValue(paymentReply('pending'));
  const view = render(<PaymentNotice />, { wrapper: f.Wrapper });
  try {
    expect(await view.findByText(/Your payment is still being checked/)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Continue secure payment' })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Check original payment' }));
    await waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(2));
    expect(openBrowserAsync).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('foreground reconciles canonical paid while browser is open and ignores claimed browser failure', async () => {
  const f = await setup();
  const browserReply = deferred<Awaited<ReturnType<typeof openBrowserAsync>>>();
  jest.mocked(openBrowserAsync).mockImplementation(() => browserReply.promise);
  const subscribe = jest.spyOn(AppState, 'addEventListener');
  f.fetcher
    .mockResolvedValueOnce(paymentReply('ready'))
    .mockResolvedValueOnce(paymentReply('ready'))
    .mockResolvedValue(paymentReply('paid'));
  const view = render(<PaymentNotice />, { wrapper: f.Wrapper });
  try {
    fireEvent.press(await view.findByRole('button', { name: 'Continue secure payment' }));
    await waitFor(() => expect(openBrowserAsync).toHaveBeenCalledTimes(1));
    const listener = subscribe.mock.calls.filter(([event]) => event === 'change').at(-1)![1];
    act(() => listener('active'));
    expect(
      await view.findByText('Payment received. Order preparation is shown separately.'),
    ).toBeTruthy();
    await act(async () => browserReply.resolve({ type: WebBrowserResultType.CANCEL }));
    await waitFor(() =>
      expect(view.queryByRole('button', { name: 'Continue secure payment' })).toBeNull(),
    );
    expect(
      JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('checkoutUrl');
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('network failure retains original authority and exposes only a check action', async () => {
  const f = await setup();
  f.fetcher.mockResolvedValue(response({}, 503));
  const view = render(<PaymentNotice />, { wrapper: f.Wrapper });
  try {
    expect(await view.findByText(/We could not confirm the original payment/)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Continue secure payment' })).toBeNull();
    expect((await f.repository.payments.load(f.context, f.principal, () => {}))?.state).toBe(
      'pending',
    );
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('forgets visible ready action on unmount and removes its query data', async () => {
  const f = await setup();
  f.fetcher.mockResolvedValue(paymentReply('ready'));
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
  const view = render(<PaymentNotice />, { wrapper: f.Wrapper });
  await view.findByRole('button', { name: 'Continue secure payment' });
  view.unmount();
  await waitFor(() => expect(f.cache.getQueryCache().getAll()).toHaveLength(0));
  expect(remove).toHaveBeenCalled();
});
