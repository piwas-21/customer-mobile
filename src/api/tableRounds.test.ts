import { prepareTableRound, resolveTableRound } from './tableRounds';
import { tableRoundFixture, roundGuard, roundOutcome } from '../test/tableRoundRepository';
import { response } from '../test/transport';
import { secretKey } from '../core/credentials';
import { tableRoundPath } from '../core/tableRoundRequest';
import { fixtureDirectory, tenantA } from '../test/fixtures';

it.each([false, true])(
  'sends one exact prepared round with independent participant and original basket authority: customer=%s',
  async (customer) => {
    const f = await tableRoundFixture(customer);
    f.fetcher.mockResolvedValue(response({ success: true, data: f.prepared }));
    expect(
      await prepareTableRound(f.client, f.context, f.review.preparation, roundGuard, 'fr'),
    ).toEqual(f.prepared);
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(tableRoundPath + '/prepare');
    expect(options.body).toBe(JSON.stringify(f.review.preparation.intent));
    expect(options.headers).toMatchObject({
      'X-Session-Id': f.request.sessionId,
      'X-Table-Participant': 'A'.repeat(43),
      'Accept-Language': 'fr',
    });
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer old-access' : undefined);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([false, true])(
  'first submit sends the original acknowledged intent and proof exactly once: customer=%s',
  async (customer) => {
    const f = await tableRoundFixture(customer);
    const record = await f.install();
    const applied = roundOutcome(record, true);
    f.fetcher.mockResolvedValue(response({ success: true, data: applied }));
    expect(
      await resolveTableRound(
        f.client,
        f.context,
        record,
        { phase: 'submit', preparation: f.review.preparation },
        roundGuard,
        'en',
      ),
    ).toEqual(applied);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(tableRoundPath + '/submit');
    expect(JSON.parse(options.body!)).toEqual({
      ...record.intent,
      payloadHash: record.proof.payloadHash,
      ownerProof: record.proof.ownerProof,
    });
    expect(options.headers?.['X-Table-Participant']).toBe('A'.repeat(43));
  },
);
it.each([false, true])(
  'original proof recovery survives local leave and removal of current basket session: customer=%s',
  async (customer) => {
    const f = await tableRoundFixture(customer);
    const record = await f.install();
    await f.store.remove(secretKey(f.context, 'guest-session', f.principal));
    await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
    const applied = roundOutcome(record, true);
    f.fetcher.mockResolvedValue(response({ success: true, data: applied }));
    expect(
      await resolveTableRound(f.client, f.context, record, { phase: 'recover' }, roundGuard, 'en'),
    ).toEqual(applied);
    const [, options] = f.fetcher.mock.calls[0]!;
    expect(options.body).toBe(JSON.stringify(record.proof));
    expect(options.headers?.['X-Session-Id']).toBe(f.request.sessionId);
    expect(options.headers?.['X-Table-Participant']).toBeUndefined();
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer old-access' : undefined);
  },
);
it('original recover and durably requested stop remain available after directory read-only withdrawal', async () => {
  const f = await tableRoundFixture();
  const saved = await f.install();
  const record = await f.repository.tableRounds.requestCancellation(
    f.context,
    f.principal,
    saved.proof.operationId,
    roundGuard,
  );
  const directory = fixtureDirectory();
  f.boundary.updateDirectory({
    ...directory,
    tenants: directory.tenants.map((tenant) =>
      tenant.id === tenantA ? { ...tenant, status: 'read-only' } : tenant,
    ),
  });
  const context = f.boundary.capture();
  f.fetcher.mockResolvedValue(response({ success: true, data: roundOutcome(record) }));
  await expect(
    resolveTableRound(f.client, context, record, { phase: 'recover' }, roundGuard, 'en'),
  ).resolves.toEqual(roundOutcome(record));
  await expect(
    resolveTableRound(f.client, context, record, { phase: 'cancel-attempt' }, roundGuard, 'en'),
  ).resolves.toEqual(roundOutcome(record));
  await expect(
    prepareTableRound(f.client, context, f.review.preparation, roundGuard, 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it.each(['network', '401'])(
  'a first-submit %s never refreshes credentials or automatically resends',
  async (failure) => {
    const f = await tableRoundFixture(true);
    const record = await f.install();
    if (failure === 'network') f.fetcher.mockRejectedValue(new Error('Lost response'));
    else f.fetcher.mockResolvedValue(response({}, 401));
    await expect(
      resolveTableRound(
        f.client,
        f.context,
        record,
        { phase: 'submit', preparation: f.review.preparation },
        roundGuard,
        'en',
      ),
    ).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(await f.repository.tableRounds.load(f.context, f.principal, roundGuard)).toEqual(record);
  },
);
