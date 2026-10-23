import { tableShareAmounts } from './tableShareAmounts';
it.each([
  [1400n, 3, 'CHF', [465n, 465n, 470n]],
  [1400n, 3, 'EUR', [465n, 465n, 470n]],
  [1400n, 3, 'USD', [467n, 467n, 466n]],
  [9007199254740991n, 2, 'CHF', [4503599627370495n, 4503599627370496n]],
])(
  'preserves the independent exact distribution %s/%s in %s',
  (total, count, currency, expected) => {
    expect(tableShareAmounts(total, count, currency, [])).toEqual(expected);
  },
);
it('keeps ordered custom shares exact', () => {
  expect(tableShareAmounts(1400n, 2, 'CHF', [1000, 400])).toEqual([1000n, 400n]);
});
it.each([
  [0n, 2, []],
  [1n, 2, []],
  [100n, 1, []],
  [100n, 1001, []],
  [100n, 2.5, []],
  [1400n, 2, [400, 400]],
  [1400n, 2, [1400]],
  [1400n, 2, [0, 1400]],
  [1400n, 2, [0.5, 1399.5]],
])('refuses an impossible distribution %s/%s/%j', (total, count, custom) => {
  expect(() => tableShareAmounts(total, count, 'CHF', custom)).toThrow();
});
