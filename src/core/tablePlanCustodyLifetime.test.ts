import { tableVisitControllerFixture } from '../test/tableVisitController';
import { tablePlanFixture } from '../test/tablePlanRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
import { tenantB } from '../test/fixtures';
it('refuses silent secure write loss before returning dispatchable plan custody', async () => {
  const f = await tablePlanFixture();
  const key = secretKey(f.context, 'table-plan-operation', f.principal);
  const set = f.store.set;
  jest
    .spyOn(f.store, 'set')
    .mockImplementation((k, value) => (k === key ? Promise.resolve() : set(k, value)));
  await expect(f.install()).rejects.toThrow('Secure value save incomplete');
});
it.each(['session', 'participant'] as const)(
  'refuses replaced %s before plan custody',
  async (field) => {
    const f = await tablePlanFixture();
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
    expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toBeNull();
  },
);
it('withdraws paused secure reads before saving when the original owner changes', async () => {
  const f = await tablePlanFixture();
  let active = true;
  const get = f.store.get;
  const participant = secretKey(f.context, 'table-participant', f.principal);
  jest.spyOn(f.store, 'get').mockImplementation(async (key) => {
    const value = await get(key);
    if (key === participant) active = false;
    return value;
  });
  await expect(
    f.repository.tablePlans.install(f.context, f.preparation, f.prepared, () => {
      if (!active) throw new Error('Owner withdrawn');
    }),
  ).rejects.toThrow('Owner withdrawn');
  expect(await f.store.get(secretKey(f.context, 'table-plan-operation', f.principal))).toBeNull();
});
it('independently expires participant authority after the final secure read', async () => {
  const f = await tablePlanFixture();
  const get = f.store.get;
  const now = jest.spyOn(Date, 'now');
  const key = secretKey(f.context, 'table-participant', f.principal);
  jest.spyOn(f.store, 'get').mockImplementation(async (k) => {
    const value = await get(k);
    if (k === key) now.mockReturnValue(Date.parse(f.preparation.visit.identity.expiresAt));
    return value;
  });
  try {
    await expect(f.install()).rejects.toThrow();
    expect(await f.store.get(secretKey(f.context, 'table-plan-operation', f.principal))).toBeNull();
  } finally {
    now.mockRestore();
  }
});
it('preserves minimal original recovery after explicit local leaving and blocks replacement admission', async () => {
  const f = await tablePlanFixture();
  const record = await f.install();
  await f.repository.tableVisits.leave(
    f.context,
    f.principal,
    record.intent.serviceSessionId,
    roundGuard,
  );
  expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toEqual(record);
  await expect(
    f.repository.tableVisits.install(
      f.context,
      f.principal,
      f.preparation.visit.identity,
      roundGuard,
    ),
  ).rejects.toThrow();
});
it('restores the Customer session only while original plan recovery exists after local leaving', async () => {
  const f = await tablePlanFixture(true);
  await f.install();
  await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
  expect((await new SessionRepository(f.store).loadForOrderRecovery(f.context))?.userId).toBe(
    f.principal.id,
  );
  await f.store.remove(secretKey(f.context, 'table-plan-operation', f.principal));
  expect(await new SessionRepository(f.store).loadForOrderRecovery(f.context)).toBeNull();
});
it.each([false, true])(
  'logout preserves original proof and Customer reminder: automatic=%s',
  async (automatic) => {
    const f = await tablePlanFixture(true);
    const record = await f.install();
    const session = await f.repository.load(f.context);
    if (session === null) throw new Error('Missing fixture session');
    await f.repository.clear(f.context, session, automatic);
    expect(await new SessionRepository(f.store).load(f.context)).toBeNull();
    expect(await f.store.get(secretKey(f.context, 'table-participant', f.principal))).toBeNull();
    expect(await f.store.get(secretKey(f.context, 'guest-session', f.principal))).toBeNull();
    expect(await f.repository.loadPaymentAttention(f.context)).toBe(f.principal.id);
    expect(
      await new SessionRepository(f.store).tablePlans.load(f.context, f.principal, roundGuard),
    ).toEqual(record);
  },
);
it('requires acknowledged terminal deletion and retains the original on failed removal', async () => {
  const f = await tablePlanFixture();
  const record = await f.install();
  const stopped = await f.repository.tablePlans.finish(
    f.context,
    record,
    f.resolution('stopped'),
    roundGuard,
  );
  const key = secretKey(f.context, 'table-plan-operation', f.principal);
  const remove = f.store.remove;
  const spy = jest
    .spyOn(f.store, 'remove')
    .mockImplementation((k) => (k === key ? Promise.resolve() : remove(k)));
  await expect(f.repository.tablePlans.acknowledge(f.context, stopped, roundGuard)).rejects.toThrow(
    'Secure value removal incomplete',
  );
  expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toEqual(stopped);
  spy.mockRestore();
  await f.repository.tablePlans.acknowledge(f.context, stopped, roundGuard);
});
it('refuses stale finish input and wrong original cancellation identity', async () => {
  const f = await tablePlanFixture();
  const record = await f.install();
  await expect(
    f.repository.tablePlans.requestCancellation(
      f.context,
      f.principal,
      record.intent.tenantId,
      roundGuard,
    ),
  ).rejects.toThrow();
  await expect(
    f.repository.tablePlans.finish(
      f.context,
      { ...record, proof: { ...record.proof, ownerProof: 'another-original' } },
      f.resolution('applied'),
      roundGuard,
    ),
  ).rejects.toThrow();
});

it('refuses anonymous admission before dispatch when an original plan remains unresolved', async () => {
  const original = await tablePlanFixture();
  const record = await original.install();
  const f = await tableVisitControllerFixture();
  const review = await f.actor.prepare('a-fresh-physical-qr');
  await f.store.set(
    secretKey(f.context, 'table-plan-operation', f.principal),
    JSON.stringify({
      ...record,
      environment: f.context.environment,
      tenantId: f.context.tenant.id,
      principal: f.principal,
    }),
  );
  await expect(f.actor.confirm(review.reviewId, 'fr')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
  expect(await f.actor.saved()).toBeNull();
});
