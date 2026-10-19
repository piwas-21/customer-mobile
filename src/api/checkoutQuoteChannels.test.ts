import { readCheckoutQuote } from './checkoutQuote';
import { checkoutQuote, checkoutQuoteFixture } from '../test/checkoutQuote';
import { currentBasketOwner } from '../test/basketOperations';
import { response } from '../test/transport';
it('allows a signed-in customer to review enabled loyalty without spending points', async () => {
  const f = await checkoutQuoteFixture(true);
  f.request.bootstrap.capabilities.loyalty = 'enabled';
  f.request.pointsToRedeem = 100;
  const quote = checkoutQuote();
  quote.money = { ...quote.money, pointsRedeemed: 100, pointsDiscount: 1, total: 16 };
  f.fetcher.mockResolvedValue(response({ success: true, data: quote }));
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).resolves.toEqual(quote);
  expect(f.fetcher.mock.calls[0]![1].headers?.Authorization).toMatch(/^Bearer /);
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
it('retains delivery pricing while excluding the takeaway-only card method', async () => {
  const f = await checkoutQuoteFixture();
  f.request.reviewed.orderType = 'Delivery';
  const quote = checkoutQuote();
  quote.type = 'Delivery';
  quote.availablePaymentMethods = ['Cash'];
  quote.money = { ...quote.money, deliveryFee: 4, total: 21 };
  f.fetcher.mockResolvedValue(response({ success: true, data: quote }));
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).resolves.toEqual(quote);
  quote.availablePaymentMethods.push('CreditCard');
  f.fetcher.mockResolvedValue(response({ success: true, data: quote }));
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).rejects.toMatchObject({ reason: 'contract' });
});
it.each(['unknown', 'disabled', 'unavailable'])(
  'refuses customer points when loyalty is %s',
  async (state) => {
    const f = await checkoutQuoteFixture(true);
    f.request.bootstrap.capabilities.loyalty = state as 'unknown' | 'disabled' | 'unavailable';
    f.request.pointsToRedeem = 100;
    await expect(
      readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
    ).rejects.toMatchObject({ reason: 'contract' });
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('only accepts an online method when the matching bootstrap explicitly enables it', async () => {
  const f = await checkoutQuoteFixture();
  f.request.bootstrap.capabilities['online-payments'] = 'enabled';
  const quote = checkoutQuote();
  quote.availablePaymentMethods.push('OnlinePayment');
  f.fetcher.mockResolvedValue(response({ success: true, data: quote }));
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).resolves.toEqual(quote);
});
it('does not retry failed quote requests or leave a durable financial operation', async () => {
  const f = await checkoutQuoteFixture();
  f.fetcher.mockRejectedValue(new Error('Offline'));
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).rejects.toMatchObject({ reason: 'network' });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
