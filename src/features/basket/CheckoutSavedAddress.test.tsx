import '../../i18n';
import { Modal } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useCheckoutFields from './useCheckoutFields';
import CheckoutControl from './CheckoutControl';
import { sessionSetup } from '../../test/sessions';
import { tenantA } from '../../test/fixtures';
import { response } from '../../test/transport';
import { addressPage, savedAddress } from '../../test/savedAddresses';
import { basketState } from '../../test/basketState';
import { basketResponse } from '../../test/basketApi';
import { checkoutQuote } from '../../test/checkoutQuote';
import { checkoutFields } from '../../domain/checkoutFields';
import { customerForms } from '../../test/customerForms';
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('./useCheckoutFields', () => ({ __esModule: true, default: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
async function setup(
  address = savedAddress(),
  type: 'Delivery' | 'Takeaway' = 'Delivery',
  hidden: readonly string[] = [],
) {
  const f = await sessionSetup();
  jest.mocked(useSession).mockReturnValue({
    controller: f.controller,
    userId: tenantA,
    ownerVersion: f.controller.ownerVersion,
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
  const forms = customerForms().map((form) => ({
    ...form,
    fields: form.fields.map((field) =>
      hidden.includes(field.fieldKey) ? { ...field, isVisible: false, isRequired: false } : field,
    ),
  }));
  jest.mocked(useCheckoutFields).mockReturnValue({
    fields: checkoutFields(forms, type),
    isPending: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCheckoutFields>);
  f.fetcher.mockResolvedValue(response({ success: true, data: addressPage([address]) }));
  const quote = { ...checkoutQuote(), type, availablePaymentMethods: ['Cash'] as ['Cash'] };
  const basket = basketState({
    basket: { ...basketResponse(), orderType: type },
    quote: jest.fn(async () => quote),
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = render(
    <QueryClientProvider client={cache}>
      <CheckoutControl basket={basket} />
    </QueryClientProvider>,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Checkout' }));
  fireEvent.changeText(screen.getByLabelText('Full name'), 'Customer');
  fireEvent.changeText(screen.getByLabelText('Email'), 'customer@example.test');
  fireEvent.changeText(screen.getByLabelText('Phone number'), '+41000000000');
  const pick = async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Choose a saved delivery address' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use Home address' })).toBeTruthy(),
    );
  };
  return {
    ...f,
    basket,
    screen,
    cache,
    pick,
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
it('selects explicitly in one modal, preserves full details, and uses the existing server-reviewed checkout payload', async () => {
  const f = await setup(savedAddress(1, { state: 'GE' }));
  try {
    expect(f.screen.getByLabelText('Street address')).toHaveProp('value', '');
    await f.pick();
    expect(f.screen.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(f.screen.queryByRole('button', { name: 'Edit Home' })).toBeNull();
    expect(f.screen.queryByRole('button', { name: 'Remove Home' })).toBeNull();
    expect(f.screen.queryByRole('button', { name: 'Add address' })).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Use Home address' }));
    expect(f.screen.getByLabelText('Street address')).toHaveProp(
      'value',
      'Rue de la Paix 7\nFloor 2',
    );
    expect(f.screen.getByLabelText('City')).toHaveProp('value', 'Geneva, GE');
    expect(f.screen.getByLabelText('Phone number')).toHaveProp('value', '+41790000000');
    expect(f.basket.quote).not.toHaveBeenCalled();
    expect(f.basket.placeOrder).not.toHaveBeenCalled();
    expect(f.cache.getQueryCache().findAll()).toHaveLength(0);
    await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
    await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Place order' })));
    expect(f.basket.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: { name: 'Customer', email: 'customer@example.test', phone: '+41790000000' },
        address: {
          street: 'Rue de la Paix 7\nFloor 2',
          city: 'Geneva, GE',
          postalCode: '1201',
          country: 'CH',
          additionalInfo: 'Ring once',
        },
      }),
    );
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
  } finally {
    f.dispose();
  }
});
it('cancel keeps manual details and a read failure withdraws selection without affecting manual checkout', async () => {
  const f = await setup();
  try {
    fireEvent.changeText(f.screen.getByLabelText('Street address'), 'Manual street');
    await f.pick();
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.screen.getByLabelText('Street address')).toHaveProp('value', 'Manual street');
    await f.pick();
    f.fetcher.mockResolvedValueOnce(response({}, 503));
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh addresses' }));
    await waitFor(() =>
      expect(f.screen.getByText(/Your saved addresses could not be loaded/)).toBeTruthy(),
    );
    expect(f.screen.queryByRole('button', { name: 'Use Home address' })).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.screen.getByLabelText('Street address')).toHaveProp('value', 'Manual street');
    expect(f.basket.placeOrder).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});
it('retains overlong combined text for correction and refuses price review rather than dropping the apartment', async () => {
  const f = await setup(
    savedAddress(1, { addressLine1: 'A'.repeat(200), addressLine2: 'B'.repeat(200) }),
  );
  try {
    await f.pick();
    fireEvent.press(f.screen.getByRole('button', { name: 'Use Home address' }));
    expect(f.screen.getByLabelText('Street address')).toHaveProp(
      'value',
      'A'.repeat(200) + '\n' + 'B'.repeat(200),
    );
    expect(f.screen.getByText('Check this field before continuing.')).toBeTruthy();
    await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
    expect(f.basket.quote).not.toHaveBeenCalled();
    fireEvent.changeText(f.screen.getByLabelText('Street address'), 'Reviewed street, apartment B');
    await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
    expect(f.basket.quote).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});
it('takeaway retains manual contact without offering address reads', async () => {
  const f = await setup(savedAddress(), 'Takeaway');
  try {
    expect(f.screen.queryByRole('button', { name: 'Choose a saved delivery address' })).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it.each([
  {
    key: 'additionalInfo',
    label: 'Delivery instructions (optional)',
    patch: { deliveryInstructions: '🍜'.repeat(500) },
  },
  { key: 'country', label: 'Country (optional)', patch: { country: '🍜'.repeat(100) } },
])(
  'reveals hidden imported $key for non-truncating Unicode correction before review',
  async ({ key, label, patch }) => {
    const f = await setup(savedAddress(1, patch), 'Delivery', [key]);
    try {
      expect(f.screen.queryByLabelText(label)).toBeNull();
      await f.pick();
      fireEvent.press(f.screen.getByRole('button', { name: 'Use Home address' }));
      const text = key === 'country' ? patch.country : patch.deliveryInstructions;
      expect(f.screen.getByLabelText(label)).toHaveProp('value', text);
      expect(f.screen.getByText('Check this field before continuing.')).toBeTruthy();
      await act(async () =>
        fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })),
      );
      expect(f.basket.quote).not.toHaveBeenCalled();
      fireEvent.changeText(f.screen.getByLabelText(label), '');
      await act(async () =>
        fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })),
      );
      expect(f.basket.quote).toHaveBeenCalledTimes(1);
    } finally {
      f.dispose();
    }
  },
);
