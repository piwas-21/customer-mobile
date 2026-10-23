import { resolveTableCheckout } from './tableContributions';
import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { contributionResolution, contributionCheckout } from '../test/tablePayment';
import { response } from '../test/transport';
import { secretKey } from '../core/credentials';
import { tableContributionCheckoutPath } from '../core/tableContributionRequest';
it('starts the same reserved attempt with original live authority and never treats ready as payment', async () => {
  const f = await tableContributionFixture();
  const installed = await f.install();
  const record = await f.repository.tablePayments.finishResolution(
    f.context,
    installed,
    contributionResolution(),
    roundGuard,
  );
  const ready = {
    ...contributionCheckout(),
    outcome: 'ready',
    checkoutUrl: new URL('/original', f.context.tenant.webOrigin).toString(),
  };
  f.fetcher.mockResolvedValue(response({ success: true, data: ready }));
  expect(
    await resolveTableCheckout(
      f.client,
      f.context,
      record,
      { phase: 'start', preparation: f.preparation },
      roundGuard,
      'en',
    ),
  ).toEqual(ready);
  const [url, options] = f.fetcher.mock.calls[0]!;
  expect(new URL(url).pathname).toBe(tableContributionCheckoutPath + '/start');
  expect(options.body).toBe(JSON.stringify(record.proof));
  expect(options.headers?.['X-Table-Participant']).toBe('A'.repeat(43));
  expect(record.checkout).toBeNull();
});
it('checkout recovery carries only the original live visit and remains possible without it', async () => {
  const f = await tableContributionFixture();
  const installed = await f.install();
  const record = await f.repository.tablePayments.finishResolution(
    f.context,
    installed,
    contributionResolution(),
    roundGuard,
  );
  f.fetcher.mockResolvedValue(response({ success: true, data: contributionCheckout() }));
  await resolveTableCheckout(f.client, f.context, record, { phase: 'recover' }, roundGuard, 'en');
  expect(f.fetcher.mock.calls[0]![1].headers?.['X-Table-Participant']).toBe('A'.repeat(43));
  await f.store.remove(secretKey(f.context, 'table-participant', f.principal));
  await resolveTableCheckout(f.client, f.context, record, { phase: 'recover' }, roundGuard, 'en');
  expect(f.fetcher.mock.calls[1]![1].headers?.['X-Table-Participant']).toBeUndefined();
  expect(
    f.fetcher.mock.calls.every(([, options]) => options.body === JSON.stringify(record.proof)),
  ).toBe(true);
});
it.each(['expired', 'foreign-visit', 'stopping'])(
  'minimal checkout recovery withholds participant authority when %s',
  async (condition) => {
    const f = await tableContributionFixture();
    const installed = await f.install();
    let record = await f.repository.tablePayments.finishResolution(
      f.context,
      installed,
      contributionResolution(),
      roundGuard,
    );
    if (condition === 'stopping')
      record = await f.repository.tablePayments.requestCancellation(
        f.context,
        f.principal,
        record.proof.operationId,
        roundGuard,
      );
    else
      await f.store.set(
        secretKey(f.context, 'table-participant', f.principal),
        JSON.stringify({
          ...f.preparation.visit,
          identity: {
            ...f.preparation.visit.identity,
            ...(condition === 'expired'
              ? { expiresAt: '2020-01-01T00:00:00Z' }
              : { serviceSessionId: record.proof.operationId }),
          },
        }),
      );
    f.fetcher.mockResolvedValue(response({ success: true, data: contributionCheckout() }));
    await resolveTableCheckout(
      f.client,
      f.context,
      record,
      { phase: condition === 'stopping' ? 'stop' : 'recover' },
      roundGuard,
      'en',
    );
    expect(f.fetcher.mock.calls[0]![1].headers?.['X-Table-Participant']).toBeUndefined();
    expect(f.fetcher.mock.calls[0]![1].headers?.['X-Session-Id']).toBe(record.sessionId);
  },
);
