import { prepareTablePlan, resolveTablePlan } from '../api/tablePlans';
import { tablePlanFixture } from '../test/tablePlanRepository';
import { tablePlanRenewalFixture } from '../test/tablePlanRenewal';
import { roundGuard } from '../test/tableRoundRepository';
import { planResolution } from '../test/tablePlan';
import { authResponse } from '../test/sessions';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';
import { secretKey } from './credentials';
it('snapshots prepared wire input before paused credential reads', async () => {
  const f = await tablePlanFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const read = f.repository.vault.capability.bind(f.repository.vault);
  jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return read(...args);
  });
  f.fetcher.mockResolvedValue(response({ success: true, data: f.prepared }));
  const expected = JSON.stringify(f.preparation.intent);
  const pending = prepareTablePlan(f.client, f.context, f.preparation, roundGuard, 'en');
  await entered.promise;
  f.preparation.intent.expectedAccountRevision = 99;
  f.preparation.visit.identity.participantToken = 'B'.repeat(43);
  release.resolve();
  await expect(pending).resolves.toEqual(f.prepared);
  expect(f.fetcher.mock.calls[0]![1].body).toBe(expected);
  expect(f.fetcher.mock.calls[0]![1].headers?.['X-Table-Participant']).toBe('A'.repeat(43));
});
it.each(['owner', 'tenant', 'participant-expiry'])(
  'withdraws a paused first-submit header read before dispatch: %s',
  async (mode) => {
    const f = await tablePlanFixture();
    f.preparation.visit.identity.expiresAt = new Date(Date.now() + 10_000).toISOString();
    await f.store.set(
      secretKey(f.context, 'table-participant', f.principal),
      JSON.stringify(f.preparation.visit),
    );
    const record = await f.install();
    const entered = deferred<void>();
    const release = deferred<void>();
    let active = true;
    const read = f.repository.vault.capability.bind(f.repository.vault);
    jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return read(...args);
    });
    const pending = resolveTablePlan(
      f.client,
      f.context,
      record,
      { phase: 'submit', preparation: f.preparation },
      () => {
        if (!active) throw new Error('Owner withdrew');
      },
      'en',
    );
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    if (mode === 'owner') active = false;
    if (mode === 'tenant') f.boundary.clear();
    const clock =
      mode === 'participant-expiry'
        ? jest
            .spyOn(Date, 'now')
            .mockReturnValue(Date.parse(f.preparation.visit.identity.expiresAt))
        : null;
    try {
      release.resolve();
      await rejected;
      expect(f.fetcher).not.toHaveBeenCalled();
      if (clock) expect(() => f.boundary.assertCurrent(f.context)).not.toThrow();
    } finally {
      clock?.mockRestore();
      release.resolve();
    }
  },
);
it('withholds a late original response after resource withdrawal while preserving original custody', async () => {
  const f = await tablePlanFixture();
  const record = await f.install();
  const entered = deferred<void>();
  const reply = deferred<Response>();
  let active = true;
  f.fetcher.mockImplementation(() => {
    entered.resolve();
    return reply.promise;
  });
  const pending = resolveTablePlan(
    f.client,
    f.context,
    record,
    { phase: 'recover' },
    () => {
      if (!active) throw new Error('Resource withdrew');
    },
    'en',
  );
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;
  active = false;
  reply.resolve(response({ success: true, data: planResolution() }));
  await rejected;
  expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toEqual(record);
});
it.each(['owner', 'resource', 'tenant'])(
  'withdrawn %s cannot install a renewed token or retry original proof',
  async (mode) => {
    const f = await tablePlanRenewalFixture();
    const entered = deferred<void>();
    const reply = deferred<Response>();
    let active = true;
    f.fetcher.mockImplementation(async (url) => {
      if (url.endsWith('/refresh-token')) {
        entered.resolve();
        return reply.promise;
      }
      return response({}, 401);
    });
    const pending = f.sessions.recovery.tablePlan(f.record, 'recover', 'en', () => {
      if (!active) throw new Error('Resource withdrew');
    });
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    if (mode === 'owner') await f.sessions.logout();
    if (mode === 'resource') active = false;
    if (mode === 'tenant') f.boundary.clear();
    reply.resolve(authResponse());
    await rejected;
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect((await f.repository.vault.session(f.context, f.principal.id))?.accessToken).not.toBe(
      'new-access',
    );
  },
);
it('a durable stop during a paused Customer read prevents dispatch of stale recovery', async () => {
  const f = await tablePlanRenewalFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const read = f.repository.vault.session.bind(f.repository.vault);
  jest.spyOn(f.repository.vault, 'session').mockImplementation(async (...args) => {
    entered.resolve();
    await release.promise;
    return read(...args);
  });
  f.fetcher.mockResolvedValue(response({ success: true, data: planResolution() }));
  const pending = f.sessions.recovery.tablePlan(f.record, 'recover', 'en', f.guard);
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;
  await f.repository.tablePlans.requestCancellation(
    f.context,
    f.principal,
    f.record.proof.operationId,
    f.guard,
  );
  release.resolve();
  await rejected;
  expect(f.fetcher).not.toHaveBeenCalled();
});
