import { tablePaymentIntentSchema } from './tablePaymentIntent';
import { bindPreparedTablePayment } from './tablePaymentPrepared';
import { bindTablePaymentResolution } from './tablePaymentResolution';
import { bindTableCheckoutDecision, tableCheckoutDecisionSchema } from './tableCheckoutDecision';
import {
  contributionIntent,
  preparedContribution,
  contributionResolution,
  contributionCheckout,
  contributionAttempt,
} from '../test/tablePayment';
import { tenantA, tenantB } from '../test/fixtures';
import { paymentReadSession } from '../test/tablePaymentAccount';

it.each([
  ['Full', 1400, {}],
  ['Amount', 350, { amountMinor: 350 }],
  [
    'Items',
    700,
    { selectedUnits: [{ orderId: tenantB, orderItemId: paymentReadSession, ordinal: 2 }] },
  ],
  ['Equal', 700, { equalSharePlanId: paymentReadSession, equalShareOrdinal: 2 }],
  ['CustomAmount', 400, { customSharePlanId: paymentReadSession, customShareOrdinal: 2 }],
])('binds the independent %s CHF fixture to original review', (mode, amount, fields) => {
  const intent = tablePaymentIntentSchema.parse({ ...contributionIntent(), mode, ...fields });
  const response = {
    ...preparedContribution(),
    mode,
    amountMinor: amount,
    allocations: [
      {
        ...preparedContribution().allocations[0],
        unitCount: 1,
        ...(mode === 'Items'
          ? { orderId: tenantB, orderItemId: paymentReadSession, startOrdinal: 2 }
          : {}),
        minorPerUnit: amount,
        amountMinor: amount,
      },
    ],
  };
  expect(bindPreparedTablePayment(intent, 'CHF', response)).toEqual(response);
});
it.each([
  { amountMinor: 0 },
  { amountMinor: 350 },
  { mode: 'Future' },
  { selectedUnits: null },
  { equalSharePlanId: paymentReadSession },
  { customShareOrdinal: 1 },
  { paymentMethod: 'OnlinePayment' },
])('rejects ambiguous, unknown or mode-incompatible intent %j', (fields) => {
  expect(() => tablePaymentIntentSchema.parse({ ...contributionIntent(), ...fields })).toThrow();
});
it('rejects duplicate selected units before dispatch', () => {
  const unit = { orderId: tenantB, orderItemId: null, ordinal: 1 };
  expect(() =>
    tablePaymentIntentSchema.parse({
      ...contributionIntent(),
      mode: 'Items',
      selectedUnits: [unit, unit],
    }),
  ).toThrow();
});
it.each([
  { amountMinor: 1401 },
  { currency: 'EUR' },
  { accountRevision: 8 },
  { mode: 'Amount' },
  { serviceSessionId: tenantB },
  { proof: { ...preparedContribution().proof, operationId: tenantA } },
  { allocations: [{ ...preparedContribution().allocations[0], minorPerUnit: 701 }] },
])('rejects unbound server review %j', (fields) => {
  expect(() =>
    bindPreparedTablePayment(contributionIntent(), 'CHF', { ...preparedContribution(), ...fields }),
  ).toThrow();
});
it('keeps an applied reservation separate from payment and rejects invented order IDs', () => {
  const applied = contributionResolution();
  expect(bindTablePaymentResolution(contributionIntent(), applied, 'submit').attemptId).toBe(
    contributionAttempt,
  );
  expect(() =>
    bindTablePaymentResolution(
      contributionIntent(),
      { ...applied, orderId: contributionAttempt },
      'recover',
    ),
  ).toThrow();
  expect(() =>
    bindTablePaymentResolution(contributionIntent(), { ...applied, attemptId: null }, 'recover'),
  ).toThrow();
  const unseen = { ...applied, outcome: 'Unseen', attemptId: null, state: null };
  expect(bindTablePaymentResolution(contributionIntent(), unseen, 'recover').outcome).toBe(
    'Unseen',
  );
  expect(() => bindTablePaymentResolution(contributionIntent(), unseen, 'submit')).toThrow();
});
it.each([
  'tenantId',
  'operationId',
  'serviceSessionId',
  'attemptId',
  'amountMinor',
  'currency',
  'expiresAt',
] as const)('binds checkout %s to the acknowledged original contribution', (field) => {
  const original = contributionCheckout();
  const wrong = {
    ...original,
    [field]:
      field === 'amountMinor'
        ? 1401
        : field === 'currency'
          ? 'EUR'
          : field === 'expiresAt'
            ? '2035-01-02T00:00:00Z'
            : paymentReadSession,
  };
  expect(() => bindTableCheckoutDecision(original, wrong)).toThrow();
});
it('browser return text cannot become paid and pending cannot carry a hosted URL', () => {
  expect(() =>
    tableCheckoutDecisionSchema.parse({ ...contributionCheckout(), paid: true }),
  ).toThrow();
  expect(() =>
    tableCheckoutDecisionSchema.parse({
      ...contributionCheckout(),
      checkoutUrl: 'https://checkout.example.test',
    }),
  ).toThrow();
  expect(() =>
    tableCheckoutDecisionSchema.parse({
      ...contributionCheckout(),
      outcome: 'paid',
      attemptId: null,
    }),
  ).toThrow();
  expect(() =>
    tableCheckoutDecisionSchema.parse({
      ...contributionCheckout(),
      outcome: 'paid',
      expiresAt: null,
    }),
  ).toThrow();
});
