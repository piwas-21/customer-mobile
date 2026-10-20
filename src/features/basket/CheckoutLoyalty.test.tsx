import { act, fireEvent } from '@testing-library/react-native';
import { configureCheckoutUiFields, checkoutUiFixture } from '../../test/checkoutUi';
import { deferred } from '../../test/deferred';
import type { CheckoutQuote } from '../../api/checkoutQuoteResponse';
import CheckoutControl from './CheckoutControl';
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
beforeEach(configureCheckoutUiFields);
it.each([0, 60, 100])(
  'requests 100 points, shows server-applied %s and places exactly that reviewed request once',
  async (applied) => {
    const f = checkoutUiFixture('Takeaway', true);
    f.quote.money.pointsRedeemed = applied;
    f.quote.money.pointsDiscount = applied / 100;
    f.quote.money.customerDiscount = 2;
    f.quote.money.total = 12 - applied / 100;
    f.enter();
    fireEvent.changeText(f.screen.getByLabelText('Points to use (optional)'), '100');
    await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
    expect(f.basket.quote).toHaveBeenCalledWith({ pointsToRedeem: 100, tip: 0 });
    expect(f.screen.getByText(`${applied} of 100 requested points applied`)).toBeTruthy();
    expect(f.screen.getByText('Discount: CHF 2.00')).toBeTruthy();
    expect(f.basket.placeOrder).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Place order' })));
    expect(f.basket.placeOrder).toHaveBeenCalledTimes(1);
    expect(f.basket.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        review: expect.objectContaining({ pointsToRedeem: 100 }),
        expectedQuoteFingerprint: f.quote.quoteFingerprint,
      }),
    );
  },
);
it('rejects fractional points before a quote or financial write', async () => {
  const f = checkoutUiFixture('Takeaway', true);
  f.enter();
  fireEvent.changeText(f.screen.getByLabelText('Points to use (optional)'), '1.5');
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.screen.getByText('Enter a whole number of points, or leave it blank.')).toBeTruthy();
  expect(f.basket.quote).not.toHaveBeenCalled();
  expect(f.basket.placeOrder).not.toHaveBeenCalled();
});
it('does not expose points selection to an ineligible basket', () => {
  const f = checkoutUiFixture();
  f.enter();
  expect(f.screen.queryByLabelText('Points to use (optional)')).toBeNull();
});
it('withdraws a late points quote across disable/re-enable and requires a fresh explicit review', async () => {
  const f = checkoutUiFixture('Takeaway', true);
  const pending = deferred<CheckoutQuote>();
  f.basket.quote = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(f.quote);
  f.enter();
  fireEvent.changeText(f.screen.getByLabelText('Points to use (optional)'), '100');
  fireEvent.press(f.screen.getByRole('button', { name: 'Review order' }));
  f.screen.rerender(<CheckoutControl basket={{ ...f.basket, canRedeemPoints: false }} />);
  f.screen.rerender(<CheckoutControl basket={f.basket} />);
  await act(async () => pending.resolve(f.quote));
  expect(f.screen.queryByRole('button', { name: 'Place order' })).toBeNull();
  fireEvent.press(f.screen.getByRole('button', { name: 'Back to your details' }));
  expect(f.screen.getByDisplayValue('100')).toBeTruthy();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.basket.quote).toHaveBeenCalledTimes(2);
  expect(f.screen.getByRole('button', { name: 'Place order' })).toBeTruthy();
  expect(f.basket.placeOrder).not.toHaveBeenCalled();
});
it('requires removal of entered points after capability withdrawal and preserves contact for zero-point review', async () => {
  const f = checkoutUiFixture('Takeaway', true);
  f.enter();
  fireEvent.changeText(f.screen.getByLabelText('Points to use (optional)'), '100');
  f.screen.rerender(<CheckoutControl basket={{ ...f.basket, canRedeemPoints: false }} />);
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.basket.quote).not.toHaveBeenCalled();
  fireEvent.press(f.screen.getByRole('button', { name: 'Remove requested points' }));
  expect(f.screen.getByDisplayValue('Native guest')).toBeTruthy();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  expect(f.basket.quote).toHaveBeenCalledWith({ pointsToRedeem: 0, tip: 0 });
});
it('withdraws the quote when the owner revision changes even if basket data is identical', async () => {
  const f = checkoutUiFixture('Takeaway', true);
  f.enter();
  await act(async () => fireEvent.press(f.screen.getByRole('button', { name: 'Review order' })));
  f.screen.rerender(
    <CheckoutControl
      basket={{
        ...f.basket,
        revision: [
          f.basket.revision[0],
          f.basket.revision[1],
          f.basket.revision[2],
          f.basket.revision[3],
          f.basket.revision[4],
          'new-owner',
          f.basket.revision[6],
        ],
      }}
    />,
  );
  expect(f.screen.queryByRole('button', { name: 'Place order' })).toBeNull();
});
