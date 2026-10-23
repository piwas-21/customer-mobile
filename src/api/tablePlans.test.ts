import { prepareTablePlan, resolveTablePlan } from './tablePlans';
import { tablePlanFixture } from '../test/tablePlanRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { planResolution } from '../test/tablePlan';
import { response } from '../test/transport';
import { secretKey } from '../core/credentials';
import { tablePlanPath } from '../core/tablePlanRequest';
import { fixtureDirectory, tenantA } from '../test/fixtures';
it.each([false, true])(
  'prepares exact original input with separate participant/session and Customer=%s',
  async (customer) => {
    const f = await tablePlanFixture(customer);
    f.fetcher.mockResolvedValue(response({ success: true, data: f.prepared }));
    expect(await prepareTablePlan(f.client, f.context, f.preparation, roundGuard, 'fr')).toEqual(
      f.prepared,
    );
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(tablePlanPath + '/prepare');
    expect(options.body).toBe(JSON.stringify(f.preparation.intent));
    expect(options.headers).toMatchObject({
      'X-Session-Id': f.preparation.sessionId,
      'X-Table-Participant': 'A'.repeat(43),
      'Accept-Language': 'fr',
    });
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer old-access' : undefined);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([false, true])(
  'submits acknowledged original intent/proof once for Customer=%s',
  async (customer) => {
    const f = await tablePlanFixture(customer);
    const record = await f.install();
    f.fetcher.mockResolvedValue(response({ success: true, data: planResolution() }));
    expect(
      await resolveTablePlan(
        f.client,
        f.context,
        record,
        { phase: 'submit', preparation: f.preparation },
        roundGuard,
        'en',
      ),
    ).toEqual(planResolution());
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(tablePlanPath + '/submit');
    expect(JSON.parse(options.body!)).toEqual({ intent: record.intent, proof: record.proof });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([false, true])(
  'recovers minimal original proof after current credentials leave for Customer=%s',
  async (customer) => {
    const f = await tablePlanFixture(customer);
    const record = await f.install();
    await f.store.remove(secretKey(f.context, 'guest-session', f.principal));
    await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
    f.fetcher.mockResolvedValue(response({ success: true, data: planResolution() }));
    await resolveTablePlan(f.client, f.context, record, { phase: 'recover' }, roundGuard, 'en');
    const [, options] = f.fetcher.mock.calls[0]!;
    expect(options.body).toBe(JSON.stringify(record.proof));
    expect(options.headers?.['X-Session-Id']).toBe(record.sessionId);
    expect(options.headers?.['X-Table-Participant']).toBeUndefined();
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer old-access' : undefined);
  },
);
it('durably acknowledged stop and recovery survive directory read-only withdrawal', async () => {
  const f = await tablePlanFixture();
  const saved = await f.install();
  const record = await f.repository.tablePlans.requestCancellation(
    f.context,
    f.principal,
    saved.proof.operationId,
    roundGuard,
  );
  const directory = fixtureDirectory();
  f.boundary.updateDirectory({
    ...directory,
    tenants: directory.tenants.map((t) => (t.id === tenantA ? { ...t, status: 'read-only' } : t)),
  });
  const context = f.boundary.capture();
  const stopped = { ...planResolution(), outcome: 'stopped', planId: null };
  f.fetcher.mockResolvedValue(response({ success: true, data: stopped }));
  await resolveTablePlan(f.client, context, record, { phase: 'recover' }, roundGuard, 'en');
  await resolveTablePlan(f.client, context, record, { phase: 'stop' }, roundGuard, 'en');
  await expect(
    prepareTablePlan(f.client, context, f.preparation, roundGuard, 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it.each(['network', '401'])(
  'first submission %s never renews or automatically resends',
  async (failure) => {
    const f = await tablePlanFixture(true);
    const record = await f.install();
    if (failure === 'network') f.fetcher.mockRejectedValue(new Error('Lost response'));
    else f.fetcher.mockResolvedValue(response({}, 401));
    await expect(
      resolveTablePlan(
        f.client,
        f.context,
        record,
        { phase: 'submit', preparation: f.preparation },
        roundGuard,
        'en',
      ),
    ).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toEqual(record);
  },
);

it('rejects preparation that arrives after participant expiry without acknowledging new custody', async () => {
  const f = await tablePlanFixture();
  f.preparation.visit.identity.expiresAt = new Date(Date.now() + 10_000).toISOString();
  await f.store.set(
    secretKey(f.context, 'table-participant', f.principal),
    JSON.stringify(f.preparation.visit),
  );
  const clock = jest.spyOn(Date, 'now');
  f.fetcher.mockImplementation(async () => {
    clock.mockReturnValue(Date.parse(f.preparation.visit.identity.expiresAt));
    return response({ success: true, data: f.prepared });
  });
  try {
    await expect(
      prepareTablePlan(f.client, f.context, f.preparation, roundGuard, 'en'),
    ).rejects.toThrow();
    expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toBeNull();
    expect(() => f.boundary.assertCurrent(f.context)).not.toThrow();
  } finally {
    clock.mockRestore();
  }
});
it('rejects a same-total shifted ordered split response', async () => {
  const f = await tablePlanFixture();
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { ...f.prepared, sharesMinor: [470, 465, 465] } }),
  );
  await expect(
    prepareTablePlan(f.client, f.context, f.preparation, roundGuard, 'en'),
  ).rejects.toThrow();
  expect(await f.repository.tablePlans.load(f.context, f.principal, roundGuard)).toBeNull();
});
it.each(['network', '401'])(
  'preparation %s is sent once without token renewal',
  async (failure) => {
    const f = await tablePlanFixture(true);
    if (failure === 'network') f.fetcher.mockRejectedValue(new Error('Lost preparation'));
    else f.fetcher.mockResolvedValue(response({}, 401));
    await expect(
      prepareTablePlan(f.client, f.context, f.preparation, roundGuard, 'en'),
    ).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
