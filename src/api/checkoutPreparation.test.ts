import { prepareCustomerOrder } from './checkoutPreparation';
import { checkoutIntent } from '../test/customerOrder';
import { checkoutQuote, checkoutQuoteFixture } from '../test/checkoutQuote';
import { currentBasketOwner } from '../test/basketOperations';
import { response } from '../test/transport';
import { tenantA } from '../test/fixtures';
it('prepares an exact reviewed intent without writing an order operation journal', async () => {
  const f = await checkoutQuoteFixture();
  const prepared = { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() };
  f.fetcher.mockResolvedValue(response({ success: true, data: prepared }));
  const result = await prepareCustomerOrder(
    f.client,
    f.context,
    { ...f.request, intent: checkoutIntent() },
    currentBasketOwner,
  );
  expect(result).toEqual({
    intent: checkoutIntent(),
    payloadHash: prepared.payloadHash,
    quote: checkoutQuote(),
  });
  expect(JSON.parse(f.fetcher.mock.calls[0]![1].body!)).toEqual(checkoutIntent());
  expect(await f.repository.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
it.each([
  { payloadHash: 'invalid' },
  { schemaVersion: 2 },
  { extra: true },
  { quote: { ...checkoutQuote(), quoteFingerprint: 'd'.repeat(64) } },
  { quote: { ...checkoutQuote(), basketId: tenantA } },
  { quote: { ...checkoutQuote(), currency: 'EUR' } },
  { quote: { ...checkoutQuote(), money: { ...checkoutQuote().money, tip: 4 } } },
])('refuses substituted or unsupported server preparation %j', async (patch) => {
  const f = await checkoutQuoteFixture();
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote(), ...patch },
    }),
  );
  await expect(
    prepareCustomerOrder(
      f.client,
      f.context,
      { ...f.request, intent: checkoutIntent() },
      currentBasketOwner,
    ),
  ).rejects.toMatchObject({ reason: 'contract' });
});
it('refuses an intent with a different review before dispatch and snapshots contact across credential awaits', async () => {
  const f = await checkoutQuoteFixture();
  const intent = checkoutIntent();
  await expect(
    prepareCustomerOrder(
      f.client,
      f.context,
      { ...f.request, intent: { ...intent, review: { ...intent.review, tip: 4 } } },
      currentBasketOwner,
    ),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: { schemaVersion: 1, payloadHash: 'c'.repeat(64), quote: checkoutQuote() },
    }),
  );
  const pending = prepareCustomerOrder(
    f.client,
    f.context,
    { ...f.request, intent },
    currentBasketOwner,
  );
  intent.contact.name = 'Changed during credentials';
  expect((await pending).intent.contact.name).toBe('Fixture guest');
  expect(f.fetcher.mock.calls[0]![1].body).not.toContain('Changed during credentials');
});
