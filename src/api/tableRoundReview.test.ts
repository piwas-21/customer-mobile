import { tableRoundReview } from './tableRoundReview';
import { tableRoundFixture } from '../test/tableRoundRepository';
import { preparedRound } from '../test/tableRound';
import { tenantA, tenantB } from '../test/fixtures';

it.each([false, true])(
  'reviews the original shared round without applying personal basket prices: customer=%s',
  async (customer) => {
    const f = await tableRoundFixture(customer);
    f.request.basket.customerDiscount = 9;
    f.request.basket.total = 1;
    const review = tableRoundReview(f.context, f.request);
    expect(review.preparation.intent).toEqual({
      schemaVersion: 1,
      operationId: tenantB,
      tenantId: tenantA,
      serviceSessionId: tenantA,
      expectedAccountRevision: 7,
      expectedBasketId: tenantB,
      expectedPurchaseFingerprint: 'A'.repeat(64),
    });
    expect(review.accept(preparedRound()).quote.money.total).toBe(14);
    expect(review.preparation.visit.identity.participantToken).toBe('A'.repeat(43));
  },
);
it.each([
  'ordering',
  'table-visits',
  'accounts',
  'flag',
  'lifecycle',
  'compatibility',
  'currency',
  'account-currency',
  'visit',
  'basket-channel',
  'basket-owner',
  'empty',
  'expiry',
  'session',
  'tenant',
  'revision',
])('refuses a new review after original authority changes: %s', async (field) => {
  const f = await tableRoundFixture(true);
  const r = f.request;
  if (field === 'ordering' || field === 'table-visits' || field === 'accounts')
    r.bootstrap.capabilities[field] = 'disabled';
  if (field === 'flag') r.bootstrap.flags.tableGuestVisitsV1 = false;
  if (field === 'lifecycle') r.bootstrap.lifecycle = 'read-only';
  if (field === 'compatibility') r.bootstrap.compatibility = 'update-required';
  if (field === 'currency') r.bootstrap.currency = null;
  if (field === 'account-currency') r.account.currency = 'EUR';
  if (field === 'visit') r.account.serviceSessionId = tenantB;
  if (field === 'basket-channel') Object.assign(r.basket, { orderType: 'Takeaway' });
  if (field === 'basket-owner') r.basket.userId = tenantB;
  if (field === 'empty') r.basket.items = [];
  if (field === 'expiry') r.visit.identity.expiresAt = '2020-01-01T00:00:00Z';
  if (field === 'session') r.sessionId = r.sessionId.toUpperCase();
  if (field === 'tenant') r.bootstrap.tenantId = tenantB;
  if (field === 'revision') r.account.accountRevision = Number.MAX_SAFE_INTEGER + 1;
  expect(() => tableRoundReview(f.context, r)).toThrow();
});
it.each([
  'product',
  'menu',
  'variation',
  'quantity',
  'instructions',
  'root',
  'missing',
  'duplicate',
])('refuses substituted server composition: %s', async (field) => {
  const f = await tableRoundFixture();
  const prepared = preparedRound();
  const row = prepared.quote.items[0]!;
  if (field === 'product') row.productId = tenantB;
  if (field === 'menu') row.menuId = tenantB;
  if (field === 'variation') row.productVariationId = tenantB;
  if (field === 'quantity') row.quantity = 3;
  if (field === 'instructions') row.specialInstructions = 'different';
  if (field === 'root') row.basketItemId = tenantB;
  if (field === 'missing') prepared.quote.items = [];
  if (field === 'duplicate') prepared.quote.items.push({ ...row });
  expect(() => f.review.accept(prepared)).toThrow();
});
it('snapshots reviewed roots and original visit before caller mutations', async () => {
  const f = await tableRoundFixture();
  f.request.basket.items[0]!.quantity = 99;
  f.request.visit.identity.participantToken = 'B'.repeat(43);
  f.request.account.accountRevision = 999;
  expect(f.review.accept(preparedRound()).quote.items[0]!.quantity).toBe(2);
  expect(f.review.preparation.visit.identity.participantToken).toBe('A'.repeat(43));
  expect(f.review.preparation.intent.expectedAccountRevision).toBe(7);
});
it('refuses duplicate reviewed roots before any request', async () => {
  const f = await tableRoundFixture();
  f.request.basket.items.push({ ...f.request.basket.items[0]! });
  expect(() => tableRoundReview(f.context, f.request)).toThrow();
});

it('rejects duplicate response identities that replace a different reviewed root without changing row count', async () => {
  const f = await tableRoundFixture();
  f.request.basket.items.push({ ...f.request.basket.items[0]!, id: tenantB });
  const review = tableRoundReview(f.context, f.request);
  const response = preparedRound();
  response.quote.items.push({ ...response.quote.items[0]! });
  expect(() => review.accept(response)).toThrow();
});
