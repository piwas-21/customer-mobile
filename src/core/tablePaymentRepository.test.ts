import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { contributionResolution, contributionCheckout } from '../test/tablePayment';
import { tenantA, tenantB } from '../test/fixtures';
import { SessionRepository } from './sessionRepository';
import { secretKey } from './credentials';
import { TablePaymentStorage } from './tablePaymentStorage';

it.each([false, true])(
  'acknowledges and restores one private original contribution: customer=%s',
  async (customer) => {
    const f = await tableContributionFixture(customer);
    const record = await f.install();
    expect(
      await new SessionRepository(f.store).tablePayments.load(f.context, f.principal, roundGuard),
    ).toEqual(record);
    expect(record.review).toEqual({ mode: 'Full', amountMinor: 1400, currency: 'CHF' });
    expect(JSON.stringify(record)).not.toMatch(
      /participantToken|customerEmail|accessToken|checkoutUrl|orderId/,
    );
    await expect(f.install()).rejects.toThrow();
  },
);
it('arbitrates competing payment and basket/round claims through the same secure queue', async () => {
  const f = await tableContributionFixture();
  const results = await Promise.allSettled([f.install(), f.install()]);
  expect(results.map((row) => row.status)).toEqual(['fulfilled', 'rejected']);
  expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, roundGuard)).toBe(
    true,
  );
  await expect(
    f.repository.tableRounds.install(f.context, f.review.preparation, f.roundPrepared, roundGuard),
  ).rejects.toThrow();
  await expect(
    f.repository.tableVisits.install(
      f.context,
      f.principal,
      f.preparation.visit.identity,
      roundGuard,
    ),
  ).rejects.toThrow();
});
it.each(['basket-operation', 'order-operation-proof'] as const)(
  'refuses malformed prior %s instead of replacing it',
  async (kind) => {
    const f = await tableContributionFixture();
    await f.store.set(secretKey(f.context, kind, f.principal), 'incomplete');
    await expect(f.install()).rejects.toThrow();
    expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toBeNull();
  },
);
it('retains an original whose secure acknowledgement is lost and refuses replacement after restart', async () => {
  const f = await tableContributionFixture();
  const key = secretKey(f.context, 'table-payment-operation', f.principal);
  const original = f.store.set;
  const write = jest.spyOn(f.store, 'set').mockImplementation(async (k, value) => {
    await original(k, value);
    if (k === key) throw new Error('Lost acknowledgement');
  });
  await expect(f.install()).rejects.toThrow('Lost acknowledgement');
  write.mockRestore();
  expect(
    (await new SessionRepository(f.store).tablePayments.load(f.context, f.principal, roundGuard))
      ?.proof,
  ).toEqual(f.prepared.proof);
  await expect(f.install()).rejects.toThrow();
});
it('unseen recovery and accepted reservation retain the hold and never imply paid', async () => {
  const f = await tableContributionFixture();
  const record = await f.install();
  const unseen = { ...contributionResolution(), outcome: 'Unseen', attemptId: null, state: null };
  expect(
    await f.repository.tablePayments.finishResolution(f.context, record, unseen, roundGuard),
  ).toEqual(record);
  await expect(
    f.repository.tablePayments.acknowledge(f.context, record, roundGuard),
  ).rejects.toThrow();
  const reserved = await f.repository.tablePayments.finishResolution(
    f.context,
    record,
    contributionResolution(),
    roundGuard,
  );
  expect(reserved.resolution?.outcome).toBe('Applied');
  expect(reserved.checkout).toBeNull();
  await expect(
    new TablePaymentStorage(f.store).assertResolved(f.context, f.principal, roundGuard),
  ).rejects.toThrow();
});
it('persists canonical pending evidence before browser use while keeping the hosted URL volatile', async () => {
  const f = await tableContributionFixture();
  const installed = await f.install();
  const record = await f.repository.tablePayments.finishResolution(
    f.context,
    installed,
    contributionResolution(),
    roundGuard,
  );
  const saved = await f.repository.tablePayments.finishCheckout(
    f.context,
    record,
    {
      ...contributionCheckout(),
      outcome: 'ready',
      checkoutUrl: 'https://checkout.example.test/original',
    },
    roundGuard,
  );
  expect(saved.checkout).toEqual({ outcome: 'pending', expiresAt: '2035-01-01T00:00:00Z' });
  expect([...f.store.values.values()].join()).not.toContain('checkout.example.test');
  await expect(
    f.repository.tablePayments.acknowledge(f.context, saved, roundGuard),
  ).rejects.toThrow();
});
it.each(['attemptId', 'currency', 'expiresAt'] as const)(
  'refuses changed canonical %s without overwriting the original',
  async (field) => {
    const f = await tableContributionFixture();
    const installed = await f.install();
    const record = await f.repository.tablePayments.finishResolution(
      f.context,
      installed,
      contributionResolution(),
      roundGuard,
    );
    const saved = await f.repository.tablePayments.finishCheckout(
      f.context,
      record,
      contributionCheckout(),
      roundGuard,
    );
    const changed = {
      ...contributionCheckout(),
      [field]:
        field === 'currency' ? 'EUR' : field === 'expiresAt' ? '2036-01-01T00:00:00Z' : tenantA,
    };
    await expect(async () =>
      f.repository.tablePayments.finishCheckout(f.context, saved, changed, roundGuard),
    ).rejects.toThrow();
    expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toEqual(
      saved,
    );
  },
);
it('acknowledges stopping before dispatch and preserves it across a late response', async () => {
  const f = await tableContributionFixture();
  const record = await f.install();
  const stopping = await f.repository.tablePayments.requestCancellation(
    f.context,
    f.principal,
    tenantB,
    roundGuard,
  );
  expect(stopping.cancellationRequested).toBe(true);
  const late = await f.repository.tablePayments.finishResolution(
    f.context,
    record,
    contributionResolution(),
    roundGuard,
  );
  expect(late.cancellationRequested).toBe(true);
  await expect(
    f.repository.tablePayments.acknowledge(f.context, late, roundGuard),
  ).rejects.toThrow();
});
it.each(['paid', 'stopped'] as const)(
  'allows acknowledged cleanup only after canonical %s',
  async (outcome) => {
    const f = await tableContributionFixture();
    const installed = await f.install();
    const record = await f.repository.tablePayments.finishResolution(
      f.context,
      installed,
      contributionResolution(),
      roundGuard,
    );
    const resolved = await f.repository.tablePayments.finishCheckout(
      f.context,
      record,
      { ...contributionCheckout(), outcome },
      roundGuard,
    );
    await f.repository.tablePayments.acknowledge(f.context, resolved, roundGuard);
    expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toBeNull();
  },
);
it('logout retains private original custody and a customer reminder without reviving a guest payment', async () => {
  const f = await tableContributionFixture(true);
  const record = await f.install();
  const session = await f.repository.load(f.context);
  expect(session).not.toBeNull();
  await f.repository.clear(f.context, session!, true);
  expect(await f.repository.loadPaymentAttention(f.context)).toBe(f.principal.id);
  expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toEqual(record);
  expect(
    await f.repository.tablePayments.load(f.context, { kind: 'guest', id: 'basket' }, roundGuard),
  ).toBeNull();
});
