import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import SavedAddressesModal from './SavedAddressesModal';
import { sessionSetup } from '../../test/sessions';
import { tenantA } from '../../test/fixtures';
import { addressId, addressPage, savedAddress } from '../../test/savedAddresses';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import '../../i18n';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());
async function setup(data = addressPage()) {
  const fixture = await sessionSetup();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const close = jest.fn();
  fixture.fetcher.mockResolvedValue(response({ success: true, data }));
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
  }
  const screen = render(
    <SavedAddressesModal
      context={fixture.context}
      controller={fixture.controller}
      userId={tenantA}
      ownerVersion={fixture.controller.ownerVersion}
      onClose={close}
    />,
    { wrapper: Wrapper },
  );
  // Await actual ready content; the 20-row instrumented render can exceed the
  // default one-second wait on a busy native build host. This is not device timing.
  await screen.findAllByText(
    data.items[0]?.label ?? 'There are no saved addresses on this page.',
    {},
    { timeout: 5000 },
  );
  expect(screen.queryByText('Loading…')).toBeNull();
  return {
    ...fixture,
    cache,
    screen,
    close,
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
it('shows a bounded native list with optional contact/instructions and navigates one page at a time', async () => {
  const fixture = await setup(
    addressPage(
      Array.from({ length: 20 }, (_, index) =>
        savedAddress(index + 1, { label: `Address ${index + 1}` }),
      ),
      addressId(20),
    ),
  );
  try {
    expect(fixture.screen.getByText('Address 1')).toBeTruthy();
    expect(fixture.screen.getAllByText('Default address').length).toBeGreaterThan(0);
    expect(fixture.screen.getAllByText('Delivery instructions: Ring once').length).toBeGreaterThan(
      0,
    );
    fixture.fetcher.mockResolvedValueOnce(
      response({
        success: true,
        data: addressPage([
          savedAddress(21, {
            addressLine1: 'Next street',
            addressLine2: null,
            phone: null,
            deliveryInstructions: null,
            isDefault: false,
          }),
        ]),
      }),
    );
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Next addresses' }));
    await waitFor(() => expect(fixture.screen.getByText('Next street')).toBeTruthy());
    expect(fixture.screen.queryByText('Address 1')).toBeNull();
    expect(fixture.screen.queryByText('Default address')).toBeNull();
    expect(fixture.screen.queryByRole('button', { name: 'Next addresses' })).toBeNull();
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Previous addresses' }));
    await waitFor(() => expect(fixture.screen.getByText('Address 1')).toBeTruthy());
    expect(fixture.fetcher.mock.calls.map(([url]) => new URL(url).search)).toEqual([
      '?schemaVersion=1',
      `?schemaVersion=1&afterId=${addressId(20)}`,
      '?schemaVersion=1',
    ]);
  } finally {
    fixture.dispose();
  }
});
it('withdraws cached private rows on refresh error, recovers explicitly and closes through the shared native control', async () => {
  const fixture = await setup();
  try {
    expect(fixture.screen.getByText('Rue de la Paix 7')).toBeTruthy();
    fixture.fetcher.mockResolvedValueOnce(response({}, 503));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Refresh addresses' }));
    await waitFor(() =>
      expect(fixture.screen.getByText(/Your saved addresses could not be loaded/)).toBeTruthy(),
    );
    expect(fixture.screen.queryByText('Rue de la Paix 7')).toBeNull();
    fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: addressPage([]) }));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Refresh addresses' }));
    await waitFor(() =>
      expect(fixture.screen.getByText('There are no saved addresses on this page.')).toBeTruthy(),
    );
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Close' }));
    expect(fixture.close).toHaveBeenCalledTimes(1);
  } finally {
    fixture.dispose();
  }
});
it('checks current addresses on foreground and does not repopulate private cache after unmount', async () => {
  const fixture = await setup();
  const finish = deferred<Response>();
  const entered = deferred<void>();
  try {
    fixture.fetcher.mockImplementationOnce(() => {
      entered.resolve();
      return finish.promise;
    });
    const changed = jest.mocked(AppState.addEventListener).mock.calls[0]?.[1];
    await act(async () => {
      changed?.('background');
    });
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      changed?.('active');
      await entered.promise;
    });
    fixture.screen.unmount();
    finish.resolve(response({ success: true, data: addressPage() }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fixture.cache.getQueryCache().findAll()).toHaveLength(0);
  } finally {
    finish.resolve(response({}, 503));
    fixture.cache.clear();
  }
});
