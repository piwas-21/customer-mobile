import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
async function setup(isDefault = true) {
  const fixture = await sessionSetup();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fixture.fetcher.mockResolvedValue(
    response({ success: true, data: addressPage([savedAddress(1, { isDefault })]) }),
  );
  const screen = render(
    <QueryClientProvider client={cache}>
      <SavedAddressesModal
        context={fixture.context}
        controller={fixture.controller}
        userId={tenantA}
        ownerVersion={fixture.controller.ownerVersion}
        onClose={jest.fn()}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText('Rue de la Paix 7')).toBeTruthy(), {
    timeout: 5_000,
  });
  return {
    ...fixture,
    screen,
    cache,
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
it('creates from labelled native fields with one explicit default choice and refreshes the private page', async () => {
  const fixture = await setup();
  try {
    const { screen, fetcher } = fixture;
    fireEvent.press(screen.getByRole('button', { name: 'Add address' }));
    for (const [label, value] of [
      ['Label', 'Work'],
      ['Street address', 'Rue du Lac 1'],
      ['City', 'Geneva'],
      ['Postal code', '1200'],
      ['Country', 'CH'],
    ])
      fireEvent.changeText(screen.getByLabelText(label!), value);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Make default address' }));
    const address = savedAddress(2, {
      label: 'Work',
      addressLine1: 'Rue du Lac 1',
      postalCode: '1200',
      addressLine2: null,
      state: null,
      phone: null,
      deliveryInstructions: null,
    });
    fetcher.mockResolvedValueOnce(response({ success: true, data: { schemaVersion: 1, address } }));
    fetcher.mockResolvedValueOnce(response({ success: true, data: addressPage([address]) }));
    fireEvent.press(screen.getByRole('button', { name: 'Save address' }));
    await waitFor(() =>
      expect(screen.getByText('Your address change has been saved.')).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByText('Rue du Lac 1')).toBeTruthy());
    const sent = fetcher.mock.calls.find(([, options]) => options.method === 'POST')!;
    expect(JSON.parse(sent[1].body!)).toEqual({
      schemaVersion: 1,
      address: {
        label: 'Work',
        addressLine1: 'Rue du Lac 1',
        addressLine2: null,
        city: 'Geneva',
        state: null,
        postalCode: '1200',
        country: 'CH',
        phone: null,
        isDefault: true,
        deliveryInstructions: null,
      },
    });
    expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'POST', 'GET']);
  } finally {
    fixture.dispose();
  }
});
it('edits the selected address without inventing coordinates or changing untouched optional fields', async () => {
  const fixture = await setup();
  try {
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Edit Home' }));
    fireEvent.changeText(fixture.screen.getByLabelText('Label'), 'Office');
    const address = savedAddress(1, { label: 'Office' });
    fixture.fetcher.mockResolvedValueOnce(
      response({ success: true, data: { schemaVersion: 1, address } }),
    );
    fixture.fetcher.mockResolvedValueOnce(
      response({ success: true, data: addressPage([address]) }),
    );
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Save address' }));
    await waitFor(() =>
      expect(fixture.screen.getByText('Your address change has been saved.')).toBeTruthy(),
    );
    const sent = fixture.fetcher.mock.calls.find(([, options]) => options.method === 'PUT')!;
    expect(sent[0]).toContain('/addresses/' + addressId(1));
    expect(JSON.parse(sent[1].body!)).toEqual({
      schemaVersion: 1,
      address: {
        label: 'Office',
        addressLine1: 'Rue de la Paix 7',
        addressLine2: 'Floor 2',
        city: 'Geneva',
        state: null,
        postalCode: '1201',
        country: 'CH',
        phone: '+41790000000',
        isDefault: true,
        deliveryInstructions: 'Ring once',
      },
    });
  } finally {
    fixture.dispose();
  }
});
it('shows required field errors without dispatch and cancels through a fresh address read', async () => {
  const fixture = await setup();
  try {
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Add address' }));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Save address' }));
    expect(fixture.screen.getAllByText(/Required fields cannot be blank/)).toHaveLength(5);
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(fixture.screen.getByText('Rue de la Paix 7')).toBeTruthy());
    expect(fixture.fetcher.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'GET']);
  } finally {
    fixture.dispose();
  }
});
it.each(['remove', 'default'] as const)(
  'confirms %s for the visible address, sends once and refreshes',
  async (action) => {
    const fixture = await setup(false);
    try {
      const { screen, fetcher } = fixture;
      fireEvent.press(
        screen.getByRole('button', {
          name: action === 'remove' ? 'Remove Home' : 'Make Home the default',
        }),
      );
      expect(
        screen.getByText(
          action === 'remove'
            ? /Existing orders keep their original/
            : /Use this address as your default/,
        ),
      ).toBeTruthy();
      fetcher.mockResolvedValueOnce(
        response({
          success: true,
          data: {
            schemaVersion: 1,
            addressId: addressId(1),
            state: action === 'remove' ? 'removed' : 'default',
          },
        }),
      );
      fetcher.mockResolvedValueOnce(
        response({ success: true, data: addressPage(action === 'remove' ? [] : [savedAddress()]) }),
      );
      fireEvent.press(
        screen.getByRole('button', {
          name: action === 'remove' ? 'Remove address' : 'Make default address',
        }),
      );
      await waitFor(() =>
        expect(screen.getByText('Your address change has been saved.')).toBeTruthy(),
      );
      expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual([
        'GET',
        action === 'remove' ? 'DELETE' : 'POST',
        'GET',
      ]);
    } finally {
      fixture.dispose();
    }
  },
);
it('blocks busy dismissal/double presses and requires checking the list after an unknown write', async () => {
  const fixture = await setup();
  const finish = deferred<Response>();
  try {
    const { screen, fetcher } = fixture;
    fireEvent.press(screen.getByRole('button', { name: 'Edit Home' }));
    fetcher.mockReturnValueOnce(finish.promise);
    fireEvent.press(screen.getByRole('button', { name: 'Save address' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save address' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Street address')).toBeTruthy();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => {
      finish.resolve(response({}, 503));
    });
    await waitFor(() => expect(screen.getByText(/The result could not be confirmed/)).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Save address' }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByRole('button', { name: 'Check saved addresses' }));
    await waitFor(() => expect(screen.getByText('Rue de la Paix 7')).toBeTruthy());
    expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'PUT', 'GET']);
  } finally {
    finish.resolve(response({}, 503));
    fixture.dispose();
  }
});
