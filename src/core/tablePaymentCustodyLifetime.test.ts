import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
import { contributionResolution, contributionCheckout } from '../test/tablePayment';
import { tenantA, tenantB } from '../test/fixtures';
it('refuses silent secure-write loss before granting a dispatchable record', async () => {
  const f = await tableContributionFixture();
  const key = secretKey(f.context, 'table-payment-operation', f.principal);
  const original = f.store.set;
  jest
    .spyOn(f.store, 'set')
    .mockImplementation((k, value) => (k === key ? Promise.resolve() : original(k, value)));
  await expect(f.install()).rejects.toThrow('Secure value save incomplete');
});
it.each(['session', 'participant'] as const)(
  'refuses replaced %s during preparation custody',
  async (field) => {
    const f = await tableContributionFixture();
    if (field === 'session')
      await f.store.set(secretKey(f.context, 'guest-session', f.principal), tenantB);
    else
      await f.store.set(
        secretKey(f.context, 'table-participant', f.principal),
        JSON.stringify({
          ...f.preparation.visit,
          identity: { ...f.preparation.visit.identity, serviceSessionId: tenantB },
        }),
      );
    await expect(f.install()).rejects.toThrow();
    expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toBeNull();
  },
);
it('withdraws installation after a paused participant read when owner expires', async () => {
  const f = await tableContributionFixture();
  let active = true;
  const original = f.store.get;
  const key = secretKey(f.context, 'table-participant', f.principal);
  jest.spyOn(f.store, 'get').mockImplementation(async (k) => {
    const result = await original(k);
    if (k === key) active = false;
    return result;
  });
  await expect(
    f.repository.tablePayments.install(f.context, f.preparation, f.prepared, () => {
      if (!active) throw new Error('Owner withdrawn');
    }),
  ).rejects.toThrow('Owner withdrawn');
  expect(
    await f.store.get(secretKey(f.context, 'table-payment-operation', f.principal)),
  ).toBeNull();
});
it('restores only the original Customer recovery session after participant custody is removed', async () => {
  const f = await tableContributionFixture(true);
  await f.install();
  await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
  expect((await new SessionRepository(f.store).loadForOrderRecovery(f.context))?.userId).toBe(
    f.principal.id,
  );
});
it('retains a terminal record when deletion acknowledgement is lost', async () => {
  const f = await tableContributionFixture();
  const installed = await f.install();
  const reserved = await f.repository.tablePayments.finishResolution(
    f.context,
    installed,
    contributionResolution(),
    roundGuard,
  );
  const paid = await f.repository.tablePayments.finishCheckout(
    f.context,
    reserved,
    { ...contributionCheckout(), outcome: 'paid' },
    roundGuard,
  );
  const key = secretKey(f.context, 'table-payment-operation', f.principal);
  const original = f.store.remove;
  const spy = jest
    .spyOn(f.store, 'remove')
    .mockImplementation((k) => (k === key ? Promise.resolve() : original(k)));
  await expect(f.repository.tablePayments.acknowledge(f.context, paid, roundGuard)).rejects.toThrow(
    'Secure value removal incomplete',
  );
  expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toEqual(paid);
  spy.mockRestore();
  await f.repository.tablePayments.acknowledge(f.context, paid, roundGuard);
});
it('rejects foreign retained proof and wrong-ID cancellation without changing custody', async () => {
  const f = await tableContributionFixture();
  const record = await f.install();
  await expect(
    f.repository.tablePayments.requestCancellation(f.context, f.principal, tenantA, roundGuard),
  ).rejects.toThrow();
  await f.store.set(
    secretKey(f.context, 'table-payment-operation', f.principal),
    JSON.stringify({ ...record, tenantId: tenantB }),
  );
  await expect(
    f.repository.tablePayments.load(f.context, f.principal, roundGuard),
  ).rejects.toThrow();
});
it('refuses replacement admission after local leaving while the original contribution is unresolved', async () => {
  const f = await tableContributionFixture();
  const record = await f.install();
  await f.repository.tableVisits.leave(
    f.context,
    f.principal,
    record.intent.serviceSessionId,
    roundGuard,
  );
  expect(await f.repository.tableVisits.read(f.context, f.principal, roundGuard)).toBeNull();
  await expect(
    f.repository.tableVisits.install(
      f.context,
      f.principal,
      f.preparation.visit.identity,
      roundGuard,
    ),
  ).rejects.toThrow();
  expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toEqual(record);
});
