import { bindPreparedTablePayment } from './tablePaymentPrepared';
import { contributionIntent, preparedContribution } from '../test/tablePayment';
import { tenantA, tenantB } from '../test/fixtures';
import { tablePaymentIntentSchema } from './tablePaymentIntent';
const selectedUnits = [
  { orderId: tenantB, orderItemId: null, ordinal: 2 },
  { orderId: tenantB, orderItemId: tenantA, ordinal: 3 },
];
const intent = tablePaymentIntentSchema.parse({
  ...contributionIntent(),
  mode: 'Items',
  selectedUnits,
});
const first = {
  orderId: tenantB,
  orderItemId: null,
  startOrdinal: 2,
  unitCount: 1,
  minorPerUnit: 700,
  amountMinor: 700,
};
const second = { ...first, orderItemId: tenantA, startOrdinal: 3 };
const response = { ...preparedContribution(), mode: 'Items', allocations: [first, second] };
it('binds the exact nullable-item unit set independently of response order', () => {
  expect(
    bindPreparedTablePayment(intent, 'CHF', { ...response, allocations: [second, first] })
      .amountMinor,
  ).toBe(1400);
});
it.each([
  ['changed order', [{ ...first, orderId: tenantA }, second]],
  ['changed item', [{ ...first, orderItemId: tenantA }, second]],
  ['changed ordinal', [{ ...first, startOrdinal: 1 }, second]],
  ['duplicate unit', [first, first]],
  ['missing unit', [{ ...first, minorPerUnit: 1400, amountMinor: 1400 }]],
  ['combined units', [{ ...first, unitCount: 2, amountMinor: 1400 }]],
])('refuses %s even with the same total', (_name, allocations) => {
  expect(() => bindPreparedTablePayment(intent, 'CHF', { ...response, allocations })).toThrow();
});
