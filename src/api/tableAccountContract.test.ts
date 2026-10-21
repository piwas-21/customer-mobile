import { tableAccountSchema } from './tableAccountContract';
import { tableVisitIdentitySchema } from './tableVisitContract';
import { tableAccount, tableIdentity, tableItem } from '../test/tableAccount';
import { tenantB } from '../test/fixtures';
it('preserves effective account billing, original round money, frozen line totals and legacy daily identity without recomputing', () => {
  const account = tableAccount();
  expect(tableAccountSchema.parse(account)).toEqual(account);
  expect(account.items[0]!.item.itemTotal).toBe(10);
  expect(account.orders[0]!.total).toBe(15);
  expect(account.total).toBe(5);
});
it('accepts omitted additive billing columns, an empty account and a nullable legacy currency', () => {
  const account = tableAccount();
  delete account.originalTotal;
  delete account.billingCreditAmount;
  delete account.orders[0]!.payableTotal;
  delete account.orders[0]!.billingCreditAmount;
  expect(tableAccountSchema.parse(account)).toEqual(account);
  expect(
    tableAccountSchema.safeParse({ ...account, currency: null, orders: [], items: [] }).success,
  ).toBe(true);
});
it.each([-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity])(
  'refuses an inexact or unsupported account revision %s',
  (accountRevision) => {
    expect(tableAccountSchema.safeParse({ ...tableAccount(), accountRevision }).success).toBe(
      false,
    );
  },
);
it('retains negative round remaining and separate positive account credit after overpayment', () => {
  const account = tableAccount();
  account.orders[0]!.totalPaid = 6;
  account.orders[0]!.remainingAmount = -1;
  account.totalPaid = 6;
  account.remaining = 0;
  account.credit = 1;
  expect(tableAccountSchema.parse(account)).toEqual(account);
});
it.each([
  'root-private',
  'order-private',
  'line-private',
  'item-private',
  'ingredient-private',
  'duplicate-order',
  'duplicate-line',
  'unknown-order',
  'changed-number',
  'changed-day',
  'changed-daily',
])('refuses unbound or private table account payload: %s', (mode) => {
  const account = tableAccount();
  let wire: unknown = account;
  if (mode === 'root-private') wire = { ...account, customerEmail: 'private@example.test' };
  if (mode === 'order-private')
    wire = { ...account, orders: [{ ...account.orders[0], staffNotes: 'private' }] };
  if (mode === 'line-private')
    wire = { ...account, items: [{ ...account.items[0], customerId: tenantB }] };
  if (mode === 'item-private')
    wire = {
      ...account,
      items: [{ ...account.items[0], item: { ...tableItem(), internalNotes: 'private' } }],
    };
  if (mode === 'ingredient-private')
    wire = {
      ...account,
      items: [
        {
          ...account.items[0],
          item: {
            ...tableItem(),
            ingredientCustomizations: [{ ...tableItem().ingredientCustomizations[0], cost: 1 }],
          },
        },
      ],
    };
  if (mode === 'duplicate-order') account.orders.push({ ...account.orders[0]! });
  if (mode === 'duplicate-line') account.items.push({ ...account.items[0]! });
  if (mode === 'unknown-order') account.items[0]!.orderId = tableIdentity.serviceSessionId;
  if (mode === 'changed-number') account.items[0]!.orderNumber = 'another';
  if (mode === 'changed-day') account.items[0]!.businessDate = '2026-11-02';
  if (mode === 'changed-daily') account.items[0]!.dailyOrderNumber = 1;
  expect(tableAccountSchema.safeParse(wire).success).toBe(false);
});
it('bounds recursive side-item parsing at the server projection depth and preserves zero-unit legacy lines', () => {
  const account = tableAccount();
  let current = account.items[0]!.item;
  current.quantity = 0;
  account.items[0]!.unitCount = 0;
  for (let depth = 0; depth < 20; depth++) {
    const child = tableItem();
    current.sideItems.push(child);
    current = child;
  }
  expect(tableAccountSchema.safeParse(account).success).toBe(true);
  current.sideItems.push(tableItem());
  expect(tableAccountSchema.safeParse(account).success).toBe(false);
});
it('accepts only canonical 32-byte participant tokens and exact UTC expiry markers', () => {
  expect(tableVisitIdentitySchema.parse(tableIdentity)).toEqual(tableIdentity);
  for (const patch of [
    { participantToken: 'A'.repeat(42) + 'B' },
    { participantToken: 'A'.repeat(44) },
    { participantToken: 'A'.repeat(42) + '=' },
    { expiresAt: '2035-01-01' },
    { expiresAt: '2035-01-01T00:00:00.12345678Z' },
    { customerId: tenantB },
  ])
    expect(tableVisitIdentitySchema.safeParse({ ...tableIdentity, ...patch }).success).toBe(false);
});
