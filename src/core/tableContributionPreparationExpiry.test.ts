import { prepareTableContribution } from '../api/tableContributions';
import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';
import { secretKey } from './credentials';
it('withdraws a late preparation after participant expiry while the directory and original owner remain valid', async () => {
  const f = await tableContributionFixture();
  f.preparation.visit.identity.expiresAt = new Date(Date.now() + 10_000).toISOString();
  await f.store.set(
    secretKey(f.context, 'table-participant', f.principal),
    JSON.stringify(f.preparation.visit),
  );
  const entered = deferred<void>();
  const release = deferred<Response>();
  f.fetcher.mockImplementation(() => {
    entered.resolve();
    return release.promise;
  });
  const pending = prepareTableContribution(f.client, f.context, f.preparation, roundGuard, 'en');
  await entered.promise;
  const clock = jest
    .spyOn(Date, 'now')
    .mockReturnValue(Date.parse(f.preparation.visit.identity.expiresAt));
  try {
    release.resolve(response({ success: true, data: f.prepared }));
    await expect(pending).rejects.toMatchObject({ status: 409, reason: 'refused' });
    expect(() => f.boundary.assertCurrent(f.context)).not.toThrow();
    expect(await f.repository.tablePayments.load(f.context, f.principal, roundGuard)).toBeNull();
  } finally {
    clock.mockRestore();
    release.resolve(response({ success: true, data: f.prepared }));
  }
});
