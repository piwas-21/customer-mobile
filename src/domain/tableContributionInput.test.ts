import { contributionInputMinor, contributionUnitPage } from './tableContributionInput';
import { payableTableAccount } from '../test/tableContributionReview';
it.each([
  ['3.50', 350],
  ['3,5', 350],
  ['0.01', 1],
  [' 14 ', 1400],
  ['90071992547409.91', 9007199254740991],
])('parses exact minor units %s', (input, minor) => {
  expect(contributionInputMinor(input as string)).toBe(minor);
});
it.each(['', '0', '-1', '+1', '1e2', '01', '1.001', '1,234.56', '90071992547409.92', 'NaN'])(
  'refuses ambiguous or unsafe amount %s',
  (input) => {
    expect(contributionInputMinor(input)).toBeUndefined();
  },
);
it('pages a billion units without allocating a billion objects or losing the last ordinal', () => {
  const account = payableTableAccount().account;
  account.availableAllocations[0]!.unitCount = 1_000_000_000;
  const first = contributionUnitPage(account, 0);
  expect(first.units).toHaveLength(40);
  expect(first.units[0]?.ordinal).toBe(1);
  expect(first.units[39]?.ordinal).toBe(40);
  expect(first.previous).toBe(false);
  expect(first.next).toBe(true);
  const last = contributionUnitPage(account, 24_999_999);
  expect(last.units).toHaveLength(40);
  expect(last.units[39]?.ordinal).toBe(1_000_000_000);
  expect(last.previous).toBe(true);
  expect(last.next).toBe(false);
});
it('pages disjoint item ranges and skips amount-only debt without changing unit identity', () => {
  const account = payableTableAccount().account;
  const row = account.availableAllocations[0]!;
  account.availableAllocations = [
    { ...row, orderItemId: null, unitCount: 1 },
    { ...row, startOrdinal: 2, unitCount: 1 },
    { ...row, startOrdinal: 9, unitCount: 1 },
  ];
  expect(contributionUnitPage(account, 0).units.map((u) => u.ordinal)).toEqual([2, 9]);
  expect(contributionUnitPage(account, 1).units).toEqual([]);
  expect(() => contributionUnitPage(account, -1)).toThrow();
});
