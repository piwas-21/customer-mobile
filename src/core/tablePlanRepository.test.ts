import { tablePlanFixture } from '../test/tablePlanRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { SessionRepository } from './sessionRepository';
import { secretKey } from './credentials';
import { TablePlanStorage } from './tablePlanStorage';
import { tenantA, tenantB } from '../test/fixtures';
it.each([false, true])(
  'acknowledges and restores minimal original split custody: customer=%s',
  async (customer) => {
    const f = await tablePlanFixture(customer);
    const record = await f.install();
    expect(
      await new SessionRepository(f.store).tablePlans.load(f.context, f.principal, roundGuard),
    ).toEqual(record);
    expect(record.review).toEqual({
      totalMinor: 1400,
      currency: 'CHF',
      roundingIncrementMinor: 5,
      sharesMinor: [465, 465, 470],
    });
    expect(JSON.stringify(record)).not.toMatch(
      /participantToken|email|accessToken|refreshToken|checkoutUrl|allocations|orderId/,
    );
    await expect(f.install()).rejects.toThrow();
    await expect(
      f.repository.tablePlans.acknowledge(f.context, record, roundGuard),
    ).rejects.toThrow();
  },
);
it('serializes plan claims and blocks every competing table purchase', async () => {
  const f = await tablePlanFixture();
  const results = await Promise.allSettled([f.install(), f.install()]);
  expect(results.map((value) => value.status)).toEqual(['fulfilled', 'rejected']);
  expect(await f.repository.hasTablePurchaseHold(f.context, f.principal, roundGuard)).toBe(true);
  expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, roundGuard)).toBe(
    true,
  );
  await expect(f.contribution()).rejects.toThrow();
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
it('refuses a plan while an original contribution remains unresolved', async () => {
  const f = await tablePlanFixture();
  await f.contribution();
  await expect(f.install()).rejects.toThrow();
  expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toBeNull();
});
it.each(['basket-operation', 'order-operation-proof', 'table-plan-operation'] as const)(
  'refuses malformed prior %s',
  async (kind) => {
    const f = await tablePlanFixture();
    await f.store.set(secretKey(f.context, kind, f.principal), 'incomplete');
    await expect(f.install()).rejects.toThrow();
  },
);
it('lost acknowledgement retains the original and prevents replacement after restart', async () => {
  const f = await tablePlanFixture();
  const key = secretKey(f.context, 'table-plan-operation', f.principal);
  const original = f.store.set;
  const write = jest.spyOn(f.store, 'set').mockImplementation(async (k, value) => {
    await original(k, value);
    if (k === key) throw new Error('Lost acknowledgement');
  });
  await expect(f.install()).rejects.toThrow('Lost acknowledgement');
  write.mockRestore();
  expect(
    (await new SessionRepository(f.store).tablePlans.load(f.context, f.principal, roundGuard))
      ?.proof,
  ).toEqual(f.prepared.proof);
  await expect(f.install()).rejects.toThrow();
});
it('unseen retains the hold and cancellation intent survives a late applied decision', async () => {
  const f = await tablePlanFixture();
  const record = await f.install();
  expect(
    await f.repository.tablePlans.finish(f.context, record, f.resolution('unseen'), roundGuard),
  ).toEqual(record);
  expect(await f.repository.hasTablePurchaseHold(f.context, f.principal, roundGuard)).toBe(true);
  const stopping = await f.repository.tablePlans.requestCancellation(
    f.context,
    f.principal,
    record.proof.operationId,
    roundGuard,
  );
  expect(stopping.cancellationRequested).toBe(true);
  const applied = await f.repository.tablePlans.finish(
    f.context,
    record,
    f.resolution('applied'),
    roundGuard,
  );
  expect(applied.cancellationRequested).toBe(true);
  expect(applied.resolution?.outcome).toBe('applied');
  expect(await f.repository.hasTablePurchaseHold(f.context, f.principal, roundGuard)).toBe(false);
  await expect(
    f.repository.tablePlans.finish(f.context, applied, f.resolution('stopped'), roundGuard),
  ).rejects.toThrow();
  await expect(
    f.repository.tablePlans.finish(f.context, applied, f.resolution('unseen'), roundGuard),
  ).rejects.toThrow();
  expect(
    await f.repository.tablePlans.requestCancellation(
      f.context,
      f.principal,
      record.proof.operationId,
      roundGuard,
    ),
  ).toEqual(applied);
  await f.repository.tablePlans.acknowledge(f.context, applied, roundGuard);
  expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toBeNull();
});
it('stopped decisions cannot become applied and stale dismissal cannot erase a newer decision', async () => {
  const f = await tablePlanFixture();
  const record = await f.install();
  const stopped = await f.repository.tablePlans.finish(
    f.context,
    record,
    f.resolution('stopped'),
    roundGuard,
  );
  await expect(
    f.repository.tablePlans.finish(f.context, record, f.resolution('applied'), roundGuard),
  ).rejects.toThrow();
  await expect(
    f.repository.tablePlans.acknowledge(f.context, record, roundGuard),
  ).rejects.toThrow();
  expect(
    await f.repository.tablePlans.finish(f.context, stopped, f.resolution('stopped'), roundGuard),
  ).toEqual(stopped);
  await f.repository.tablePlans.acknowledge(f.context, stopped, roundGuard);
});
it.each(['owner', 'tenant', 'environment', 'intent', 'proof', 'money', 'resolution'])(
  'refuses corrupt or foreign original %s',
  async (changed) => {
    const f = await tablePlanFixture();
    const record = await f.install();
    const hostile =
      changed === 'owner'
        ? { ...record, principal: { kind: 'guest', id: tenantB } }
        : changed === 'tenant'
          ? { ...record, tenantId: tenantB }
          : changed === 'environment'
            ? { ...record, environment: 'production' }
            : changed === 'intent'
              ? { ...record, intent: { ...record.intent, tenantId: tenantB } }
              : changed === 'proof'
                ? { ...record, proof: { ...record.proof, operationId: tenantA } }
                : changed === 'money'
                  ? { ...record, review: { ...record.review, sharesMinor: [466, 466, 468] } }
                  : { ...record, resolution: f.resolution('unseen') };
    await f.store.set(
      secretKey(f.context, 'table-plan-operation', f.principal),
      JSON.stringify(hostile),
    );
    await expect(
      new TablePlanStorage(f.store).read(f.context, f.principal, roundGuard),
    ).rejects.toThrow();
  },
);
