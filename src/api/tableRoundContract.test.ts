import { tenantA, tenantB } from '../test/fixtures';
import { preparedRound, roundIntent } from '../test/tableRound';
import {
  bindPreparedTableRound,
  bindTableRoundResolution,
  tableRoundIntentSchema,
  tableRoundPreparedSchema,
  tableRoundResolutionSchema,
} from './tableRoundContract';

it('accepts the shared DineIn review with no tender, personal discount, points or tip', () => {
  const result = bindPreparedTableRound(roundIntent(), 'CHF', preparedRound());
  expect(result.quote.money.total).toBe(14);
  expect(result.quote.availablePaymentMethods).toEqual([]);
  expect(result.tableLabel).toBe('Garden');
});
it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5, NaN, Infinity])(
  'refuses an inexact or nonpositive account revision %s',
  (expectedAccountRevision) => {
    expect(
      tableRoundIntentSchema.safeParse({ ...roundIntent(), expectedAccountRevision }).success,
    ).toBe(false);
  },
);
it('preserves the last exact JavaScript account revision without rounding', () => {
  const input = { ...roundIntent(), expectedAccountRevision: Number.MAX_SAFE_INTEGER };
  expect(tableRoundIntentSchema.parse(input)).toEqual(input);
});
it.each(['operation', 'tenant', 'basket', 'fingerprint', 'currency'])(
  '%s binds the original prepared round',
  (field) => {
    const prepared = preparedRound();
    if (field === 'operation') prepared.proof.operationId = tenantA;
    if (field === 'tenant') prepared.proof.tenantId = tenantB;
    if (field === 'basket') prepared.quote.basketId = tenantA;
    if (field === 'fingerprint') prepared.quote.purchaseFingerprint = 'f'.repeat(64);
    if (field === 'currency') prepared.quote.currency = 'EUR';
    expect(() => bindPreparedTableRound(roundIntent(), 'CHF', prepared)).toThrow();
  },
);
it.each(['deliveryFee', 'customerDiscount', 'pointsDiscount', 'pointsRedeemed', 'tip'])(
  'refuses personal/tender money %s',
  (field) => {
    const prepared = preparedRound();
    const money = { ...prepared.quote.money, [field]: 1 };
    expect(
      tableRoundPreparedSchema.safeParse({ ...prepared, quote: { ...prepared.quote, money } })
        .success,
    ).toBe(false);
  },
);
it.each([
  { ...preparedRound(), customerEmail: 'private@example.test' },
  { ...preparedRound(), quote: { ...preparedRound().quote, availablePaymentMethods: ['Cash'] } },
  { ...preparedRound(), quote: { ...preparedRound().quote, type: 'Takeaway' } },
  { ...preparedRound(), proof: { ...preparedRound().proof, participantToken: 'secret' } },
  { ...preparedRound(), quote: { ...preparedRound().quote, customerId: tenantA } },
])('refuses a substituted/private preparation %j', (value) => {
  expect(tableRoundPreparedSchema.safeParse(value).success).toBe(false);
});
it('binds minimal decisions to the original operation and visit, allowing a late sealed submission', () => {
  const original = roundIntent();
  const cancelled = {
    schemaVersion: 1,
    operationId: original.operationId,
    serviceSessionId: original.serviceSessionId,
    outcome: 'Cancelled',
    orderId: null,
  };
  expect(bindTableRoundResolution(original, cancelled, 'submit')).toEqual(cancelled);
  expect(bindTableRoundResolution(original, cancelled, 'cancel-attempt')).toEqual(cancelled);
  const unseen = { ...cancelled, outcome: 'Unseen' };
  expect(bindTableRoundResolution(original, unseen, 'recover')).toEqual(unseen);
  expect(() => bindTableRoundResolution(original, unseen, 'submit')).toThrow();
  expect(() => bindTableRoundResolution(original, unseen, 'cancel-attempt')).toThrow();
  expect(() =>
    bindTableRoundResolution(original, { ...cancelled, operationId: tenantA }, 'recover'),
  ).toThrow();
  expect(() =>
    bindTableRoundResolution(original, { ...cancelled, serviceSessionId: tenantB }, 'recover'),
  ).toThrow();
});
it.each([
  { outcome: 'Applied', orderId: null },
  { outcome: 'Unseen', orderId: tenantA },
  { outcome: 'Cancelled', orderId: tenantA },
  { outcome: 'Unknown', orderId: null },
  { outcome: 'Applied', orderId: tenantA, guestStatusToken: 'secret' },
])('refuses an incoherent/private resolution %j', (patch) => {
  const original = roundIntent();
  expect(
    tableRoundResolutionSchema.safeParse({
      schemaVersion: 1,
      operationId: original.operationId,
      serviceSessionId: original.serviceSessionId,
      ...patch,
    }).success,
  ).toBe(false);
});
