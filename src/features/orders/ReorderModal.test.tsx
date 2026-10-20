import '../../i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { useSession } from '../account/SessionProvider';
import { useBasket } from '../basket/BasketProvider';
import useBootstrap from '../restaurant/useBootstrap';
import ReorderModal from './ReorderModal';
import HistoryReceiptModal from './HistoryReceiptModal';
import ReceiptModal from './ReceiptModal';
import type useOrderReceipts from './useOrderReceipts';
import { sessionSetup } from '../../test/sessions';
import { receiptResponse } from '../../test/orderReceipt';
import { response } from '../../test/transport';
import { compositionProduct } from '../../test/compositions';
import { basketState } from '../../test/basketState';
import { routerFixture } from '../../test/router';
import { deferred } from '../../test/deferred';
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../basket/BasketProvider', () => ({ useBasket: jest.fn() }));
jest.mock('../restaurant/useBootstrap');
jest.mock('expo-router', () => ({ useRouter: jest.fn(), Stack: { Screen: () => null } }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
async function setup(entry: 'reorder' | 'saved' | 'history' = 'reorder') {
  const f = await sessionSetup();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const receipt = receiptResponse();
  receipt.items = [{ ...receipt.items[0]!, specialInstructions: 'Cut again' }];
  const product = compositionProduct();
  const state = basketState();
  const router = routerFixture();
  const onBack = jest.fn();
  const onClose = jest.fn();
  f.fetcher.mockImplementation(async (url) =>
    response({ success: true, data: url.includes('/Products/') ? product : receipt }),
  );
  jest.mocked(useRouter).mockReturnValue(router);
  jest.mocked(useBasket).mockReturnValue(state);
  const sessionState = {
    controller: f.controller,
    userId: f.controller.userId,
    ownerVersion: f.controller.ownerVersion,
    needsCleanup: false,
    needsPaymentAttention: false,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  };
  jest.mocked(useSession).mockReturnValue(sessionState);
  jest.mocked(useRestaurant).mockReturnValue({
    context: f.context,
    client: f.client,
    directory: undefined,
    loading: false,
    refresh: jest.fn(),
    clear: jest.fn(),
    select: jest.fn(),
  });
  jest.mocked(useBootstrap).mockReturnValue({
    data: {
      schemaVersion: 1,
      tenantId: f.context.tenant.id,
      currency: 'CHF',
      locale: 'en',
      timezone: 'Europe/Zurich',
      lifecycle: 'active',
      compatibility: 'supported',
      modules: [],
      flags: {},
      capabilities: { menu: 'enabled', ordering: 'enabled' },
    },
  } as unknown as ReturnType<typeof useBootstrap>);
  const orders: ReturnType<typeof useOrderReceipts> = {
    session: sessionState,
    reader: undefined,
    items: undefined,
    loading: false,
    failed: false,
    busy: false,
    actionFailed: false,
    selected: undefined,
    item: undefined,
    receipt,
    receiptLoading: false,
    receiptFailed: false,
    select: jest.fn(),
    close: onClose,
    refresh: jest.fn(),
    refreshReceipt: jest.fn(),
    forget: jest.fn(async () => {}),
    canContinueAsGuest: false,
    continueAsGuest: jest.fn(async () => {}),
  };
  const element = () => (
    <QueryClientProvider client={cache}>
      {entry === 'history' ? (
        <HistoryReceiptModal
          context={f.context}
          controller={f.controller}
          userId={f.controller.userId!}
          ownerVersion={f.controller.ownerVersion}
          orderId={receipt.orderId}
          onBack={onBack}
          onClose={onClose}
        />
      ) : entry === 'saved' ? (
        <ReceiptModal orders={orders} />
      ) : (
        <ReorderModal receipt={receipt} onBack={onBack} onClose={onClose} />
      )}
    </QueryClientProvider>
  );
  const screen = render(element());
  return {
    ...f,
    cache,
    product,
    receipt,
    state,
    router,
    screen,
    onClose,
    onBack,
    sessionState,
    rerender: () => screen.rerender(element()),
    dispose: () => {
      screen.unmount();
      cache.clear();
      f.controller.dispose();
    },
  };
}
afterEach(() => jest.clearAllMocks());
it.each(['saved', 'history'] as const)(
  'opens from the %s receipt and requires current choices before the ordinary add',
  async (entry) => {
    const f = await setup(entry);
    try {
      fireEvent.press(await f.screen.findByRole('button', { name: 'Order these dishes again' }));
      expect(f.screen.getByText('Previously: 2 × Meal')).toBeTruthy();
      expect(f.fetcher.mock.calls.filter(([url]) => url.includes('/Products/'))).toHaveLength(0);
      fireEvent.press(f.screen.getByRole('button', { name: 'Configure Meal again' }));
      await f.screen.findByText('Soup');
      expect(f.state.add).not.toHaveBeenCalled();
      let steps = 0;
      while (f.screen.queryByRole('button', { name: 'Next' }) && steps++ < 10)
        fireEvent.press(f.screen.getByRole('button', { name: 'Next' }));
      expect(f.screen.getByText('Review your dish')).toBeTruthy();
      expect(f.screen.getByLabelText('Instructions for the kitchen (optional)').props.value).toBe(
        'Cut again',
      );
      fireEvent.press(f.screen.getByRole('button', { name: 'Add to basket' }));
      await waitFor(() => expect(f.router.replace).toHaveBeenCalledWith('/basket'));
      expect(f.state.add).toHaveBeenCalledTimes(1);
      expect(f.state.add).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: f.product.id,
          quantity: 2,
          specialInstructions: 'Cut again',
        }),
      );
      expect(f.onClose).toHaveBeenCalledTimes(1);
    } finally {
      f.dispose();
    }
  },
);
it('withdraws a selected historical root after an account revision and never adds from its late read', async () => {
  const f = await setup();
  const pending = deferred<Response>();
  try {
    f.fetcher.mockImplementationOnce(() => pending.promise);
    fireEvent.press(f.screen.getByRole('button', { name: 'Configure Meal again' }));
    await waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
    jest.mocked(useSession).mockReturnValue({ ...f.sessionState, ownerVersion: 'changed-owner' });
    f.rerender();
    expect(f.screen.getByRole('button', { name: 'Configure Meal again' })).toBeTruthy();
    await act(async () => pending.resolve(response({ success: true, data: f.product })));
    expect(f.screen.queryByText('Soup')).toBeNull();
    expect(f.state.add).not.toHaveBeenCalled();
  } finally {
    pending.resolve(response({}, 503));
    f.dispose();
  }
});
it('keeps navigation failure after acceptance separate from a basket write failure', async () => {
  const f = await setup();
  try {
    f.router.replace.mockImplementation(() => {
      throw new Error('Unavailable');
    });
    fireEvent.press(f.screen.getByRole('button', { name: 'Configure Meal again' }));
    await f.screen.findByText('Soup');
    expect(f.screen.queryByText(/Choose a dish to configure again/)).toBeNull();
    expect(f.screen.getByRole('button', { name: 'Back to saved dishes' })).toBeTruthy();
    expect(f.screen.queryByRole('button', { name: 'Close' })).toBeNull();
    let steps = 0;
    while (f.screen.queryByRole('button', { name: 'Next' }) && steps++ < 10)
      fireEvent.press(f.screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(f.screen.getByRole('button', { name: 'Add to basket' }));
    await waitFor(() =>
      expect(f.screen.getByRole('button', { name: 'Add to basket' })).toBeDisabled(),
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'Add to basket' }));
    expect(f.state.add).toHaveBeenCalledTimes(1);
    expect(f.onClose).not.toHaveBeenCalled();
    fireEvent.press(f.screen.getByRole('button', { name: 'Open basket' }));
    expect(f.router.push).toHaveBeenCalledWith('/basket');
    expect(f.onClose).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});

it('dismisses the reorder modal when an unknown add opens the durable basket recovery', async () => {
  const f = await setup();
  try {
    jest.mocked(f.state.add).mockRejectedValueOnce(new Error('Unconfirmed add'));
    fireEvent.press(f.screen.getByRole('button', { name: 'Configure Meal again' }));
    await f.screen.findByText('Soup');
    let steps = 0;
    while (f.screen.queryByRole('button', { name: 'Next' }) && steps++ < 10)
      fireEvent.press(f.screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(f.screen.getByRole('button', { name: 'Add to basket' }));
    fireEvent.press(await f.screen.findByRole('button', { name: 'Open basket' }));
    expect(f.router.push).toHaveBeenCalledWith('/basket');
    expect(f.onClose).toHaveBeenCalledTimes(1);
    expect(f.state.add).toHaveBeenCalledTimes(1);
    expect(f.router.replace).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});
