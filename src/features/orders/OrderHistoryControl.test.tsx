import '../../i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import OrderHistoryControl from './OrderHistoryControl';
import { historyItem, historyPage } from '../../test/orderHistory';
import { sessionSetup } from '../../test/sessions';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import { receiptResponse } from '../../test/orderReceipt';
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
async function setup(customer = true, data = historyPage()) {
  const f = await sessionSetup(customer);
  const state = {
    controller: f.controller,
    userId: f.controller.userId,
    ownerVersion: f.controller.ownerVersion,
    unavailable: false,
    needsCleanup: false,
    needsPaymentAttention: false,
    loading: false,
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
  f.fetcher.mockResolvedValue(response({ success: true, data }));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={cache}>
      <OrderHistoryControl />
    </QueryClientProvider>
  );
  const screen = render(view());
  const open = () => fireEvent.press(screen.getByRole('button', { name: 'Your account orders' }));
  return {
    ...f,
    state,
    cache,
    screen,
    view,
    open,
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
it('loads account-wide history only on request, separates unpaid status and preserves unknown legacy amounts', async () => {
  const f = await setup(
    true,
    historyPage([
      historyItem(),
      historyItem(2, {
        currency: null,
        payableTotal: null,
        paymentStatus: 'FuturePayment',
        status: 'FutureStatus',
      }),
    ]),
  );
  try {
    expect(f.fetcher).not.toHaveBeenCalled();
    f.open();
    await f.screen.findByText('Order HISTORY-1');
    expect(f.screen.getByText('Order HISTORY-2')).toBeTruthy();
    expect(f.screen.getByText('Payment pending')).toBeTruthy();
    expect(f.screen.queryByText('Paid')).toBeNull();
    expect(f.screen.getByText('Current amount payable: CHF 18.00')).toBeTruthy();
    expect(
      f.screen.getByText('Historical amount unavailable. Ask the restaurant for a receipt.'),
    ).toBeTruthy();
    expect(
      f.screen.getAllByText('Update unavailable. Ask the restaurant for the latest status.'),
    ).toHaveLength(2);
    expect(f.screen.getByText('Times shown in Europe/Zurich.')).toBeTruthy();
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.screen.queryByText('Order HISTORY-1')).toBeNull();
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
  } finally {
    f.dispose();
  }
});
it('pages older and newer orders explicitly using the exact last-item cursor', async () => {
  const items = Array.from({ length: 20 }, (_, index) => historyItem(index + 1));
  const next = { orderId: items[19]!.orderId, orderDate: items[19]!.orderDate };
  const f = await setup(true, historyPage(items, next));
  try {
    f.open();
    await f.screen.findByText('Order HISTORY-1');
    f.fetcher.mockResolvedValueOnce(
      response({ success: true, data: historyPage([historyItem(21)]) }),
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'Older orders' }));
    await f.screen.findByText('Order HISTORY-21');
    expect(f.screen.queryByText('Order HISTORY-1')).toBeNull();
    expect(new URL(f.fetcher.mock.calls[1]![0]).searchParams.get('beforeOrderId')).toBe(
      next.orderId,
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'Newer orders' }));
    await f.screen.findByText('Order HISTORY-1');
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  } finally {
    f.dispose();
  }
});
it('withdraws successful private rows and price on failed refresh and recovers through an explicit read', async () => {
  const f = await setup();
  try {
    f.open();
    await f.screen.findByText('Order HISTORY-1');
    f.fetcher.mockResolvedValueOnce(response({}, 503));
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh order history' }));
    await f.screen.findByText('Your order history could not be loaded. Refresh to check again.');
    expect(f.screen.queryByText('Order HISTORY-1')).toBeNull();
    expect(f.screen.queryByText('Current amount payable: CHF 18.00')).toBeNull();
    f.fetcher.mockResolvedValueOnce(response({ success: true, data: historyPage([]) }));
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh order history' }));
    await f.screen.findByText('There are no orders for your account at this restaurant.');
  } finally {
    f.dispose();
  }
});
it.each([false, true])(
  'cannot restore private history/detail after owner withdrawal and late success: %s',
  async (detail) => {
    const f = await setup();
    const reply = deferred<Response>();
    const entered = deferred<void>();
    if (detail) {
      f.open();
      await f.screen.findByText('Order HISTORY-1');
    }
    f.fetcher.mockImplementationOnce(() => {
      entered.resolve();
      return reply.promise;
    });
    try {
      if (detail) fireEvent.press(f.screen.getByRole('button', { name: 'View order HISTORY-1' }));
      else f.open();
      await act(async () => {
        await entered.promise;
      });
      f.controller.dispose();
      jest
        .mocked(useSession)
        .mockReturnValue({ ...f.state, userId: null, ownerVersion: f.controller.ownerVersion });
      f.screen.rerender(f.view());
      await act(async () =>
        reply.resolve(
          response({
            success: true,
            data: detail ? { ...receiptResponse(), orderId: historyItem().orderId } : historyPage(),
          }),
        ),
      );
      expect(f.screen.queryByText('Order 20261019-001')).toBeNull();
      expect(f.screen.queryByText('Order HISTORY-1')).toBeNull();
      expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    } finally {
      reply.resolve(response({}, 503));
      f.dispose();
    }
  },
);
it.each(['unavailable', 'needsCleanup'] as const)(
  'hides private history while %s and refuses a disposed account before opening',
  async (key) => {
    const f = await setup();
    try {
      jest.mocked(useSession).mockReturnValue({ ...f.state, [key]: true });
      f.screen.rerender(f.view());
      expect(f.screen.queryByRole('button', { name: 'Your account orders' })).toBeNull();
      jest.mocked(useSession).mockReturnValue(f.state);
      f.screen.rerender(f.view());
      f.controller.dispose();
      f.open();
      expect(f.fetcher).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  },
);
it('offers no account history or private read to a guest', async () => {
  const f = await setup(false);
  try {
    expect(f.screen.queryByRole('button', { name: 'Your account orders' })).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it('does not resurrect a withdrawn private modal when account availability returns', async () => {
  const f = await setup();
  try {
    f.open();
    await f.screen.findByText('Order HISTORY-1');
    jest.mocked(useSession).mockReturnValue({ ...f.state, unavailable: true });
    f.screen.rerender(f.view());
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    jest.mocked(useSession).mockReturnValue(f.state);
    f.screen.rerender(f.view());
    expect(f.screen.queryByText('Order HISTORY-1')).toBeNull();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});

it('opens the selected owned detail in one modal and returns to the history page', async () => {
  const f = await setup();
  try {
    f.open();
    await f.screen.findByText('Order HISTORY-1');
    f.fetcher.mockResolvedValueOnce(
      response({ success: true, data: { ...receiptResponse(), orderId: historyItem().orderId } }),
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'View order HISTORY-1' }));
    await f.screen.findByText('Order 20261019-001');
    expect(f.screen.queryByText('Order HISTORY-1')).toBeNull();
    expect(f.screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    fireEvent.press(f.screen.getByRole('button', { name: 'Back to your orders' }));
    await f.screen.findByText('Order HISTORY-1');
    expect(f.screen.queryByText('Order 20261019-001')).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
  } finally {
    f.dispose();
  }
});
