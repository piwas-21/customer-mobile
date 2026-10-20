import '../../i18n';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { AppState, FlatList } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HistoryReceiptModal from './HistoryReceiptModal';
import { receiptResponse } from '../../test/orderReceipt';
import { sessionSetup } from '../../test/sessions';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
// Receipt rendering is tested independently of the provider-backed reorder entry.
jest.mock('./ReorderEntry', () => ({ __esModule: true, default: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
async function setup(currency: string | null = 'CHF') {
  const f = await sessionSetup();
  const receipt = { ...receiptResponse(), currency };
  f.fetcher.mockResolvedValue(response({ success: true, data: receipt }));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onBack = jest.fn();
  const onClose = jest.fn();
  const screen = render(
    <QueryClientProvider client={cache}>
      <HistoryReceiptModal
        context={f.context}
        controller={f.controller}
        userId={f.controller.userId!}
        ownerVersion={f.controller.ownerVersion}
        orderId={receipt.orderId}
        onBack={onBack}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return {
    ...f,
    receipt,
    cache,
    onBack,
    onClose,
    screen,
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
it('shows bounded frozen receipt contents, distinct payment status and explicit navigation', async () => {
  const f = await setup();
  try {
    await f.screen.findByText('Order 20261019-001');
    expect(f.screen.getByText('Payment pending')).toBeTruthy();
    expect(f.screen.queryByText('Paid')).toBeNull();
    expect(f.screen.getByText('Total: CHF 17.00')).toBeTruthy();
    expect(f.screen.getByText('Times shown in Europe/Zurich.')).toBeTruthy();
    const scroll = within(f.screen.UNSAFE_getByType(FlatList));
    expect(scroll.getByRole('button', { name: 'Check latest status' })).toBeTruthy();
    expect(scroll.getByRole('button', { name: 'Back to your orders' })).toBeTruthy();
    expect(scroll.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Back to your orders' }));
    expect(f.onBack).toHaveBeenCalledTimes(1);
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.onClose).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
  expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
});
it('shows legacy composition while hiding every unlabeled monetary row and line price', async () => {
  const f = await setup(null);
  try {
    await f.screen.findByText('Order 20261019-001');
    expect(
      f.screen.getByText('Historical amount unavailable. Ask the restaurant for a receipt.'),
    ).toBeTruthy();
    expect(f.screen.getByText('Payment pending')).toBeTruthy();
    expect(f.screen.getByText('Meal × 2')).toBeTruthy();
    expect(f.screen.queryByText(/CHF|EUR|17\.00|Subtotal:|Total:/)).toBeNull();
  } finally {
    f.dispose();
  }
});
it('withdraws cached receipt on refresh failure and makes one explicit recovery read', async () => {
  const f = await setup();
  try {
    await f.screen.findByText('Order 20261019-001');
    f.fetcher.mockResolvedValueOnce(response({}, 503));
    fireEvent.press(f.screen.getByRole('button', { name: 'Check latest status' }));
    await f.screen.findByText('This receipt could not be loaded. Try again.');
    expect(f.screen.queryByText('Order 20261019-001')).toBeNull();
    expect(f.screen.queryByText('Total: CHF 17.00')).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Check latest status' }));
    await f.screen.findByText('Order 20261019-001');
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  } finally {
    f.dispose();
  }
});
it('rereads on foreground and hides the previous receipt until the response is verified', async () => {
  const subscribe = jest.spyOn(AppState, 'addEventListener');
  const f = await setup();
  const reply = deferred<Response>();
  try {
    await f.screen.findByText('Order 20261019-001');
    f.fetcher.mockImplementationOnce(() => reply.promise);
    const listener = subscribe.mock.calls.find(([event]) => event === 'change')![1];
    await act(async () => listener('active'));
    await waitFor(() => expect(f.screen.queryByText('Order 20261019-001')).toBeNull());
    await act(async () => reply.resolve(response({ success: true, data: f.receipt })));
    await f.screen.findByText('Order 20261019-001');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  } finally {
    reply.resolve(response({}, 503));
    f.dispose();
    subscribe.mockRestore();
  }
});
