import { prepareTableContribution, resolveTableContribution } from './tableContributions';
import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { contributionResolution } from '../test/tablePayment';
import { response } from '../test/transport';
import { secretKey } from '../core/credentials';
import { tableContributionPath } from '../core/tableContributionRequest';
import { fixtureDirectory, tenantA } from '../test/fixtures';
it.each([false, true])(
  'prepares exact original input with separate participant/session and Customer=%s',
  async (customer) => {
    const f = await tableContributionFixture(customer);
    f.fetcher.mockResolvedValue(response({ success: true, data: f.prepared }));
    expect(
      await prepareTableContribution(f.client, f.context, f.preparation, roundGuard, 'fr'),
    ).toEqual(f.prepared);
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(tableContributionPath + '/prepare');
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
    const f = await tableContributionFixture(customer);
    const record = await f.install();
    f.fetcher.mockResolvedValue(response({ success: true, data: contributionResolution() }));
    expect(
      await resolveTableContribution(
        f.client,
        f.context,
        record,
        { phase: 'submit', preparation: f.preparation },
        roundGuard,
        'en',
      ),
    ).toEqual(contributionResolution());
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe(tableContributionPath + '/submit');
    expect(JSON.parse(options.body!)).toEqual({ intent: record.intent, proof: record.proof });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([false, true])(
  'recovers minimal original proof after current credentials leave for Customer=%s',
  async (customer) => {
    const f = await tableContributionFixture(customer);
    const record = await f.install();
    await f.store.remove(secretKey(f.context, 'guest-session', f.principal));
    await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
    f.fetcher.mockResolvedValue(response({ success: true, data: contributionResolution() }));
    await resolveTableContribution(
      f.client,
      f.context,
      record,
      { phase: 'recover' },
      roundGuard,
      'en',
    );
    const [, options] = f.fetcher.mock.calls[0]!;
    expect(options.body).toBe(JSON.stringify(record.proof));
    expect(options.headers?.['X-Session-Id']).toBe(record.sessionId);
    expect(options.headers?.['X-Table-Participant']).toBeUndefined();
    expect(options.headers?.Authorization).toBe(customer ? 'Bearer old-access' : undefined);
  },
);
it('durably acknowledged stop and recovery survive directory read-only withdrawal', async () => {
  const f = await tableContributionFixture();
  const saved = await f.install();
  const record = await f.repository.tablePayments.requestCancellation(
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
  const stopped = { ...contributionResolution(), outcome: 'Stopped', attemptId: null, state: null };
  f.fetcher.mockResolvedValue(response({ success: true, data: stopped }));
  await resolveTableContribution(f.client, context, record, { phase: 'recover' }, roundGuard, 'en');
  await resolveTableContribution(f.client, context, record, { phase: 'stop' }, roundGuard, 'en');
  await expect(
    prepareTableContribution(f.client, context, f.preparation, roundGuard, 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it.each(['network', '401'])(
  'first submission %s never renews or automatically resends',
  async (failure) => {
    const f = await tableContributionFixture(true);
    const record = await f.install();
    if (failure === 'network') f.fetcher.mockRejectedValue(new Error('Lost response'));
    else f.fetcher.mockResolvedValue(response({}, 401));
    await expect(
      resolveTableContribution(
        f.client,
        f.context,
        record,
        { phase: 'submit', preparation: f.preparation },
        roundGuard,
        'en',
      ),
    ).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toEqual(
      record,
    );
  },
);
