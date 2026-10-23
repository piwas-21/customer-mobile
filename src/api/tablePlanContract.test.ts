import { tablePlanIntentSchema } from './tablePlanIntent';
import { bindPreparedTablePlan } from './tablePlanPrepared';
import { bindTablePlanResolution } from './tablePlanResolution';
import { tablePlanIntent, preparedTablePlan } from '../test/tablePlan';
import { tenantA, tenantB } from '../test/fixtures';
it('binds the independent fourteen CHF three-guest fixture', () => {
  const prepared = preparedTablePlan();
  expect(bindPreparedTablePlan(tablePlanIntent(), 'CHF', prepared)).toEqual(prepared);
  expect(prepared.sharesMinor).toEqual([465, 465, 470]);
});
it.each([
  ['EUR', 5, [465, 465, 470]],
  ['USD', 1, [467, 467, 466]],
  ['GBP', 1, [467, 467, 466]],
  ['AED', 1, [467, 467, 466]],
])('preserves exact %s server rounding', (currency, increment, shares) => {
  expect(
    bindPreparedTablePlan(tablePlanIntent(), currency, {
      ...preparedTablePlan(),
      currency,
      roundingIncrementMinor: increment,
      sharesMinor: shares,
    }).sharesMinor,
  ).toEqual(shares);
});
it('binds ordered custom shares independently of cash rounding', () => {
  const intent = { ...tablePlanIntent(), shareCount: 2, customAmountsMinor: [1000, 400] };
  const prepared = { ...preparedTablePlan(), roundingIncrementMinor: 1, sharesMinor: [1000, 400] };
  expect(bindPreparedTablePlan(intent, 'CHF', prepared)).toEqual(prepared);
  expect(() =>
    bindPreparedTablePlan(intent, 'CHF', { ...prepared, sharesMinor: [400, 1000] }),
  ).toThrow();
});
it.each([
  { shareCount: 1 },
  { shareCount: 101 },
  { shareCount: 2.5 },
  { customAmountsMinor: [1400] },
  { customAmountsMinor: null },
  { customAmountsMinor: [0, 700, 700] },
  { customAmountsMinor: [10_000_000_000, 1, 1] },
  { supersedesPlanId: '' },
  { paymentMethod: 'OnlinePayment' },
])('refuses ambiguous or unsupported intent %j', (change) => {
  expect(() => tablePlanIntentSchema.parse({ ...tablePlanIntent(), ...change })).toThrow();
});
it.each([
  { currency: 'EUR' },
  { accountRevision: 8 },
  { serviceSessionId: tenantB },
  { totalMinor: 1401 },
  { sharesMinor: [466, 466, 468] },
  { sharesMinor: [465, 935] },
  { roundingIncrementMinor: 1 },
  { proof: { ...preparedTablePlan().proof, tenantId: tenantB } },
  { proof: { ...preparedTablePlan().proof, operationId: tenantA } },
  { scope: [{ ...preparedTablePlan().scope[0], minorPerUnit: 701 }] },
  { scope: [...preparedTablePlan().scope, ...preparedTablePlan().scope] },
  { checkoutUrl: 'invalid' },
])('refuses unbound or inconsistent prepared plan %j', (change) => {
  expect(() =>
    bindPreparedTablePlan(tablePlanIntent(), 'CHF', { ...preparedTablePlan(), ...change }),
  ).toThrow();
});
it('binds minimal canonical original outcomes without treating unseen as final', () => {
  const intent = tablePlanIntent();
  const original = {
    schemaVersion: 1,
    operationId: intent.operationId,
    serviceSessionId: intent.serviceSessionId,
  };
  expect(
    bindTablePlanResolution(intent, { ...original, outcome: 'unseen', planId: null }, 'recover')
      .outcome,
  ).toBe('unseen');
  expect(() =>
    bindTablePlanResolution(intent, { ...original, outcome: 'unseen', planId: null }, 'submit'),
  ).toThrow();
  expect(() =>
    bindTablePlanResolution(intent, { ...original, outcome: 'unseen', planId: null }, 'stop'),
  ).toThrow();
  expect(
    bindTablePlanResolution(intent, { ...original, outcome: 'applied', planId: tenantB }, 'submit')
      .planId,
  ).toBe(tenantB);
  expect(
    bindTablePlanResolution(intent, { ...original, outcome: 'stopped', planId: null }, 'stop')
      .outcome,
  ).toBe('stopped');
});
it.each([
  { operationId: tenantA, outcome: 'stopped', planId: null },
  { serviceSessionId: tenantB, outcome: 'stopped', planId: null },
  { outcome: 'applied', planId: null },
  { outcome: 'stopped', planId: tenantB },
  { outcome: 'paid', planId: tenantB },
  { outcome: 'applied', planId: tenantB, ownerProof: 'private' },
])('refuses foreign or nonminimal resolution %j', (change) => {
  const intent = tablePlanIntent();
  expect(() =>
    bindTablePlanResolution(
      intent,
      {
        schemaVersion: 1,
        operationId: intent.operationId,
        serviceSessionId: intent.serviceSessionId,
        ...change,
      },
      'recover',
    ),
  ).toThrow();
});

it('rejects same-total overlapping allocation ordinals', () => {
  const prepared = preparedTablePlan();
  const row = { ...prepared.scope[0]!, unitCount: 1, amountMinor: 700 };
  expect(() =>
    bindPreparedTablePlan(tablePlanIntent(), 'CHF', { ...prepared, scope: [row, row] }),
  ).toThrow();
});
