import '../../i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { View } from 'react-native';
import type { CheckoutQuote } from '../../api/checkoutQuoteResponse';
import { basketState } from '../../test/basketState';
import { basketResponse } from '../../test/basketApi';
import { checkoutQuote } from '../../test/checkoutQuote';
import Button from '../../ui/Button';
import CheckoutReviewModal from './CheckoutReviewModal';
import type { useBasket } from './BasketProvider';
import useCheckoutReview from './useCheckoutReview';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
function Harness({ basket }: Readonly<{ basket: ReturnType<typeof useBasket> }>) {
  const review = useCheckoutReview(basket);
  return (
    <>
      {review.allowed ? <Button label="Review" onPress={() => void review.show()} /> : null}
      {review.open ? <CheckoutReviewModal review={review} /> : null}
    </>
  );
}
function state(patch: Partial<ReturnType<typeof useBasket>> = {}) {
  return basketState({ basket: { ...basketResponse(), orderType: 'Takeaway' }, ...patch });
}
it('reviews the server total and payment methods without creating a basket change or order', async () => {
  const basket = state();
  const screen = render(<Harness basket={basket} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Review' })));
  expect(basket.quote).toHaveBeenCalledWith({ pointsToRedeem: 0, tip: 0 });
  expect(screen.getByText('Total: CHF 17.00')).toBeTruthy();
  expect(screen.getByText('Cash')).toBeTruthy();
  expect(screen.getByText('Card at the restaurant')).toBeTruthy();
  expect(screen.queryByText('Online payment')).toBeNull();
  expect(screen.getByText(/No order or payment has been submitted/)).toBeTruthy();
  expect(basket.add).not.toHaveBeenCalled();
  expect(basket.mutate).not.toHaveBeenCalled();
  expect(basket.changeChannel).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText('Total: CHF 17.00')).toBeNull();
});
it('shows changed prices, tax, fees, discount, points, tip and only the server payment choices', async () => {
  const response = checkoutQuote();
  response.priceChanged = true;
  response.availablePaymentMethods = ['Cash', 'OnlinePayment'];
  Object.assign(response.money, { tax: 1, deliveryFee: 5, customerDiscount: 2, pointsDiscount: 3 });
  const screen = render(<Harness basket={state({ quote: jest.fn(async () => response) })} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Review' })));
  for (const text of [
    'Tax: CHF 1.00',
    'Delivery fee: CHF 5.00',
    'Discount: CHF 2.00',
    'Points credit: CHF 3.00',
    'Tip: CHF 3.00',
    'Online payment',
  ])
    expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByText(/Current prices differ/)).toBeTruthy();
  expect(screen.queryByText('Card at the restaurant')).toBeNull();
});
it('offers an explicit read retry after failure and never retries automatically', async () => {
  const quote = jest
    .fn<Promise<CheckoutQuote>, []>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(checkoutQuote());
  const screen = render(<Harness basket={state({ quote })} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Review' })));
  expect(quote).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/could not confirm this total/)).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
  expect(quote).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Total: CHF 17.00')).toBeTruthy();
});
it('withdraws an earlier total when the basket changes, including a response arriving afterward', async () => {
  let finish!: (value: CheckoutQuote) => void;
  const basket = state({
    quote: jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  });
  const screen = render(<Harness basket={basket} />);
  fireEvent.press(screen.getByRole('button', { name: 'Review' }));
  fireEvent.press(screen.getByRole('button', { name: 'Review' }));
  expect(basket.quote).toHaveBeenCalledTimes(1);
  screen.rerender(
    <Harness
      basket={state({ basket: { ...basket.basket!, purchaseFingerprint: 'c'.repeat(64) } })}
    />,
  );
  await act(async () => finish(checkoutQuote()));
  expect(screen.getByText(/Your basket changed/)).toBeTruthy();
  expect(screen.queryByText(/Total:/)).toBeNull();
  expect(screen.queryByText('Cash')).toBeNull();
});
it('discards a closed read and allows a fresh review while the old request finishes', async () => {
  let finish!: (value: CheckoutQuote) => void;
  const quote = jest
    .fn<Promise<CheckoutQuote>, []>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(checkoutQuote());
  const screen = render(<Harness basket={state({ quote })} />);
  fireEvent.press(screen.getByRole('button', { name: 'Review' }));
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Review' })));
  const obsolete = checkoutQuote();
  obsolete.money.total = 99;
  await act(async () => finish(obsolete));
  expect(screen.getByText('Total: CHF 17.00')).toBeTruthy();
  expect(screen.queryByText('Total: CHF 99.00')).toBeNull();
});
it.each([
  { canAdd: false, hasPending: true },
  { failed: true },
  { basket: null },
  { basket: { ...basketResponse(), orderType: 'DineIn' as const } },
  { basket: { ...basketResponse(), orderType: 'Takeaway' as const, items: [] } },
])('withholds review for an unavailable or unsupported basket: %j', (patch) => {
  const basket = state(patch);
  const screen = render(<Harness basket={basket} />);
  expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  expect(basket.quote).not.toHaveBeenCalled();
});
it('drops a private late response after the owner component has been withdrawn', async () => {
  let finish!: (value: CheckoutQuote) => void;
  const basket = state({
    quote: jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  });
  const screen = render(
    <View>
      <Harness key="old-owner" basket={basket} />
    </View>,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Review' }));
  screen.rerender(
    <View>
      <Harness key="new-owner" basket={state()} />
    </View>,
  );
  await act(async () => finish(checkoutQuote()));
  expect(screen.queryByText(/Total:/)).toBeNull();
  expect(screen.queryByText('Available payment methods')).toBeNull();
});
