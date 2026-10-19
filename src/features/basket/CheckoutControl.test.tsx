import '../../i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { checkoutFields } from '../../domain/checkoutFields';
import { customerForms } from '../../test/customerForms';
import { basketState } from '../../test/basketState';
import { basketResponse } from '../../test/basketApi';
import { checkoutQuote } from '../../test/checkoutQuote';
import { deferred } from '../../test/deferred';
import CheckoutControl from './CheckoutControl';
import useCheckoutFields from './useCheckoutFields';
import type { CustomerOrderResolution } from '../../api/customerOrderOperation';
import type { CheckoutQuote } from '../../api/checkoutQuoteResponse';
jest.mock('./useCheckoutSavedAddress', () => ({
  __esModule: true,
  default: () => ({ available: false, current: undefined }),
}));
jest.mock('./useCheckoutFields', () => ({ __esModule: true, default: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
beforeEach(() => {
  jest.mocked(useCheckoutFields).mockImplementation(
    (_open, type) =>
      ({
        fields: type ? checkoutFields(customerForms(), type) : null,
        isPending: false,
        refetch: jest.fn(),
      }) as unknown as ReturnType<typeof useCheckoutFields>,
  );
});
function fixture(type: 'Takeaway' | 'Delivery' = 'Takeaway') {
  const quote = checkoutQuote();
  quote.type = type;
  if (type === 'Delivery') quote.availablePaymentMethods = ['Cash'];
  quote.money.tip = 0;
  quote.money.total = 14;
  const basket = basketState({
    basket: { ...basketResponse(), orderType: type },
    quote: jest.fn(async () => quote),
  });
  const screen = render(<CheckoutControl basket={basket} />);
  const enter = () => {
    fireEvent.press(screen.getByRole('button', { name: 'Checkout' }));
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Native guest');
    fireEvent.changeText(screen.getByLabelText('Email'), 'native@example.test');
    fireEvent.changeText(screen.getByLabelText('Phone number'), '+41000000000');
  };
  return { basket, screen, quote, enter };
}
it('collects required contact, reviews server money and sends one chosen pending till intent only on Place order', async () => {
  const f = fixture();
  f.enter();
  expect(f.basket.quote).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.basket.quote).toHaveBeenCalledWith({ pointsToRedeem: 0, tip: 0 });
  expect(f.screen.getByText('Total: CHF 14.00')).toBeTruthy();
  fireEvent.press(f.screen.getByRole('radio', { name: 'Card at the restaurant' }));
  expect(f.screen.getByRole('radio', { name: 'Card at the restaurant' })).toHaveProp(
    'accessibilityState',
    {
      checked: true,
    },
  );
  expect(f.basket.placeOrder).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Place order' })));
  expect(f.basket.placeOrder).toHaveBeenCalledTimes(1);
  expect(f.basket.placeOrder).toHaveBeenCalledWith({
    review: {
      schemaVersion: 1,
      expectedBasketId: f.quote.basketId,
      expectedPurchaseFingerprint: f.quote.purchaseFingerprint,
      type: 'Takeaway',
      pointsToRedeem: 0,
      tip: 0,
    },
    expectedQuoteFingerprint: f.quote.quoteFingerprint,
    contact: { name: 'Native guest', email: 'native@example.test', phone: '+41000000000' },
    paymentMethod: 'CreditCard',
  });
  expect(f.screen.queryByLabelText('Email')).toBeNull();
});
it('required contact and invalid tip prevent review without any order write', async () => {
  const f = fixture();
  fireEvent.press(f.screen.getByRole('button', { name: 'Checkout' }));
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.screen.getAllByText('Check this field before continuing.')).toHaveLength(3);
  fireEvent.changeText(f.screen.getByLabelText('Full name'), 'Guest');
  fireEvent.changeText(f.screen.getByLabelText('Email'), 'native@example.test');
  fireEvent.changeText(f.screen.getByLabelText('Phone number'), '+41000000000');
  fireEvent.changeText(f.screen.getByLabelText('Tip amount (optional)'), '-1');
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.basket.quote).not.toHaveBeenCalled();
  expect(f.basket.placeOrder).not.toHaveBeenCalled();
});
it('closing clears contact, while Back retains details within the same owner', async () => {
  const f = fixture();
  f.enter();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  fireEvent.press(f.screen.getByRole('button', { name: 'Back to your details' }));
  expect(f.screen.getByDisplayValue('Native guest')).toBeTruthy();
  fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
  fireEvent.press(f.screen.getByRole('button', { name: 'Checkout' }));
  expect(f.screen.queryByDisplayValue('Native guest')).toBeNull();
});
it('a changed basket withdraws a late quote and cannot place the old order', async () => {
  const f = fixture();
  const reply = deferred<CheckoutQuote>();
  f.basket.quote = jest.fn(() => reply.promise);
  f.enter();
  fireEvent.press(f.screen.getByRole('button', { name: 'Review order' }));
  const changed = {
    ...f.basket,
    basket: { ...f.basket.basket!, purchaseFingerprint: 'c'.repeat(64) },
  };
  f.screen.rerender(<CheckoutControl basket={changed} />);
  await act(async () => reply.resolve(f.quote));
  expect(f.screen.queryByRole('button', { name: 'Place order' })).toBeNull();
  expect(f.basket.placeOrder).not.toHaveBeenCalled();
});
it('double taps and dismissal during dispatch do not submit again or expose another order retry', async () => {
  const f = fixture();
  const result = deferred<CustomerOrderResolution>();
  f.basket.placeOrder = jest.fn(() => result.promise);
  f.enter();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  const place = f.screen.getByRole('button', { name: 'Place order' });
  act(() => {
    fireEvent.press(place);
    fireEvent.press(place);
  });
  fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
  expect(f.basket.placeOrder).toHaveBeenCalledTimes(1);
  expect(f.screen.queryByRole('button', { name: 'Review order' })).toBeNull();
  await act(async () => result.reject(new Error('Unknown acceptance')));
  expect(f.screen.queryByRole('button', { name: 'Place order' })).toBeNull();
});
it('unavailable form policy blocks entry projection and offers only a public read retry', () => {
  jest.mocked(useCheckoutFields).mockReturnValue({
    fields: null,
    isPending: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCheckoutFields>);
  const f = fixture();
  fireEvent.press(f.screen.getByRole('button', { name: 'Checkout' }));
  expect(f.screen.getByText(/Checkout details are unavailable/)).toBeTruthy();
  fireEvent.press(f.screen.getByRole('button', { name: 'Try again' }));
  expect(f.basket.placeOrder).not.toHaveBeenCalled();
});

it('collects delivery floors, keeps country optional and offers only server-supported delivery payment choices', async () => {
  const f = fixture('Delivery');
  f.enter();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.basket.quote).not.toHaveBeenCalled();
  fireEvent.changeText(f.screen.getByLabelText('Street address'), 'Fixture street');
  fireEvent.changeText(f.screen.getByLabelText('Postal code'), '1000');
  fireEvent.changeText(f.screen.getByLabelText('City'), 'Fixture city');
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.screen.queryByRole('radio', { name: 'Card at the restaurant' })).toBeNull();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Place order' })));
  expect(f.basket.placeOrder).toHaveBeenCalledWith(
    expect.objectContaining({
      address: {
        street: 'Fixture street',
        city: 'Fixture city',
        postalCode: '1000',
        country: '',
        additionalInfo: '',
      },
      paymentMethod: 'Cash',
    }),
  );
});
