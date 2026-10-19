import { readCheckoutQuote } from './checkoutQuote';
import { checkoutQuote, checkoutQuoteFixture } from '../test/checkoutQuote';
import { currentBasketOwner } from '../test/basketOperations';
import { tenantA } from '../test/fixtures';
import { response } from '../test/transport';
it('requests only a server-priced review using the installed basket session and creates no journal', async () => {
  const f = await checkoutQuoteFixture();
  f.fetcher.mockResolvedValue(response({ success: true, data: checkoutQuote() }));
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).resolves.toEqual(checkoutQuote());
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(url).toContain('/api/customer-mobile/checkout/quote');
  expect(options.method).toBe('POST');
  expect(options.headers?.['X-Session-Id']).toBe(f.request.sessionId);
  expect(options.headers?.Authorization).toBeUndefined();
  expect(JSON.parse(options.body!)).toEqual({
    schemaVersion: 1,
    expectedBasketId: f.request.reviewed.id,
    expectedPurchaseFingerprint: f.request.reviewed.purchaseFingerprint,
    type: 'Takeaway',
    pointsToRedeem: 0,
    tip: 3,
  });
  expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
it.each([
  { basketId: tenantA },
  { purchaseFingerprint: 'c'.repeat(64) },
  { type: 'Delivery' },
  { currency: 'EUR' },
  { money: { ...checkoutQuote().money, tip: 4 } },
  { money: { ...checkoutQuote().money, pointsRedeemed: 1 } },
  { money: { ...checkoutQuote().money, pointsDiscount: 1 } },
  { availablePaymentMethods: ['Cash'] },
  { availablePaymentMethods: ['Cash', 'CreditCard', 'OnlinePayment'] },
  { items: [] },
  { items: [{ ...checkoutQuote().items[0], basketItemId: checkoutQuote().basketId }] },
  { items: [{ ...checkoutQuote().items[0], quantity: 1 }] },
  { items: [{ ...checkoutQuote().items[0], productId: checkoutQuote().basketId }] },
  { items: [{ ...checkoutQuote().items[0], specialInstructions: 'Substituted' }] },
])('refuses a stale, substituted or contradictory quote %j', async (patch) => {
  const f = await checkoutQuoteFixture();
  f.fetcher.mockResolvedValue(response({ success: true, data: { ...checkoutQuote(), ...patch } }));
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).rejects.toMatchObject({ reason: 'contract' });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('captures the review before credential reads and guards the owner again after the response', async () => {
  const f = await checkoutQuoteFixture();
  f.fetcher.mockResolvedValue(response({ success: true, data: checkoutQuote() }));
  const result = readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner);
  f.request.reviewed.items[0]!.quantity = 99;
  f.request.tip = 99;
  await expect(result).resolves.toEqual(checkoutQuote());
  let active = true;
  let refusedAfterResponse = false;
  f.request.reviewed.items[0]!.quantity = 2;
  f.request.tip = 3;
  f.fetcher.mockImplementation(async () => {
    active = false;
    return response({ success: true, data: checkoutQuote() });
  });
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, () => {
      if (!active) {
        refusedAfterResponse = true;
        throw new Error('Owner changed');
      }
    }),
  ).rejects.toMatchObject({ reason: 'network' });
  expect(refusedAfterResponse).toBe(true);
});
it.each([
  'foreign owner',
  'foreign tenant',
  'disabled ordering',
  'unknown channel',
  'guest points',
  'fractional tip',
  'duplicate roots',
])('refuses %s before contacting the tenant', async (change) => {
  const f = await checkoutQuoteFixture();
  if (change === 'foreign owner') f.request.reviewed.userId = tenantA;
  if (change === 'foreign tenant') f.request.bootstrap.tenantId = f.request.reviewed.id;
  if (change === 'disabled ordering') f.request.bootstrap.capabilities.ordering = 'disabled';
  if (change === 'unknown channel') f.request.reviewed.orderType = 'DineIn';
  if (change === 'guest points') f.request.pointsToRedeem = 1;
  if (change === 'fractional tip') f.request.tip = 0.001;
  if (change === 'duplicate roots') f.request.reviewed.items.push(f.request.reviewed.items[0]!);
  await expect(
    readCheckoutQuote(f.client, f.context, f.request, currentBasketOwner),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
