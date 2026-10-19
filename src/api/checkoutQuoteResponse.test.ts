import { checkoutQuoteSchema } from './checkoutQuoteResponse';
import { checkoutAmount, checkoutMoney, MAX_CHECKOUT_MONEY } from './checkoutMoney';
import { checkoutItemsSchema, type CheckoutLine } from './checkoutComposition';
import { checkoutLine, checkoutQuote } from '../test/checkoutQuote';
import { MAX_BASKET_DEPTH, MAX_BASKET_ROWS } from '../domain/basketLimits';
function child(): CheckoutLine {
  return {
    ...checkoutLine(),
    basketItemId: null,
    kind: 'BundleChild',
    unitPrice: -2,
    itemTotal: 0,
  };
}
it('preserves signed component modifiers, frozen metadata and raw fractional-cent discounts', () => {
  const quote = checkoutQuote();
  quote.items[0]!.children = [child()];
  quote.money.customerDiscount = 5.196;
  expect(checkoutQuoteSchema.parse(quote)).toEqual(quote);
});
it.each([0, 12.99, 0.01, 12345.67, MAX_CHECKOUT_MONEY])(
  'accepts persisted cent amount %s',
  (amount) => {
    expect(checkoutMoney.safeParse(amount).success).toBe(true);
  },
);
it.each([NaN, Infinity, -1, 0.001, 99_999_999.999, 100_000_000])(
  'refuses invalid money %s',
  (amount) => {
    expect(checkoutMoney.safeParse(amount).success).toBe(false);
  },
);
it('only allows signed amounts within the same cent and column bounds', () => {
  expect(checkoutAmount.safeParse(-2).success).toBe(true);
  expect(checkoutAmount.safeParse(-0.001).success).toBe(false);
  expect(checkoutAmount.safeParse(-100_000_000).success).toBe(false);
});
it('refuses duplicate root identities, child totals, missing identities and unknown row semantics', () => {
  expect(checkoutItemsSchema.safeParse([checkoutLine(), checkoutLine()]).success).toBe(false);
  for (const invalid of [
    { ...checkoutLine(), productId: null },
    { ...checkoutLine(), unitPrice: -2 },
    { ...checkoutLine(), kind: 'BundleChild' },
    { ...checkoutLine(), quantityBasis: 'Guess' },
    { ...checkoutLine(), children: [{ ...child(), itemTotal: 1 }] },
    { ...checkoutLine(), children: [{ ...child(), basketItemId: checkoutLine().basketItemId }] },
    { ...checkoutLine(), children: [{ ...child(), kind: null }] },
  ])
    expect(checkoutItemsSchema.safeParse([invalid]).success).toBe(false);
});
it('checks the depth limit iteratively before recursive parsing, including hostile cycles', () => {
  const root = checkoutLine();
  let row = root;
  for (let depth = 0; depth < MAX_BASKET_DEPTH; depth++) {
    const next = child();
    row.children = [next];
    row = next;
  }
  expect(checkoutItemsSchema.safeParse([root]).success).toBe(true);
  row.children = [child()];
  expect(checkoutItemsSchema.safeParse([root]).success).toBe(false);
  row = row.children[0]!;
  for (let depth = 0; depth < 10_000; depth++) {
    const next = child();
    row.children = [next];
    row = next;
  }
  expect(checkoutItemsSchema.safeParse([root]).success).toBe(false);
  const cycle = checkoutLine();
  cycle.children = [cycle];
  expect(checkoutItemsSchema.safeParse([cycle]).success).toBe(false);
});
it('bounds the whole graph and queued rows rather than only each child array', () => {
  const root = checkoutLine();
  root.children = Array.from({ length: MAX_BASKET_ROWS - 1 }, child);
  expect(checkoutItemsSchema.safeParse([root]).success).toBe(true);
  root.children.push(child());
  expect(checkoutItemsSchema.safeParse([root]).success).toBe(false);
});
it.each([
  { availablePaymentMethods: ['Cash', 'Cash'] },
  { availablePaymentMethods: ['BankTransfer'] },
  { schemaVersion: 2 },
  { quoteFingerprint: '' },
  { currency: 'chf' },
])('refuses unsupported response fields %j', (patch) => {
  expect(checkoutQuoteSchema.safeParse({ ...checkoutQuote(), ...patch }).success).toBe(false);
});
