import { tableContributionFixture } from '../test/tablePaymentRepository';
import { roundGuard } from '../test/tableRoundRepository';
import { TableVisitController } from './tableVisitController';
import { secretKey } from './credentials';
import { response } from '../test/transport';
import { tableIdentity } from '../test/tableAccount';
async function fixture() {
  const f = await tableContributionFixture();
  await f.install();
  await f.repository.tableVisits.leave(
    f.context,
    f.principal,
    tableIdentity.serviceSessionId,
    roundGuard,
  );
  f.fetcher.mockImplementation(async (url) =>
    response({ success: true, data: url.endsWith('/join') ? tableIdentity : f.request.bootstrap }),
  );
  const actor = new TableVisitController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.createId,
  );
  return { ...f, actor };
}
it('refuses table review before admission when the original contribution remains unresolved after local leaving', async () => {
  const f = await fixture();
  await expect(f.actor.prepare('another-table-qr')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
});
it('rechecks restored contribution evidence before anonymous Join independently of local installation refusal', async () => {
  const f = await fixture();
  const key = secretKey(f.context, 'table-payment-operation', f.principal);
  const original = f.store.values.get(key)!;
  await f.store.remove(key);
  const review = await f.actor.prepare('another-table-qr');
  // Install hostile prior evidence directly, without using the controller under test.
  await f.store.set(key, original);
  await expect(f.actor.confirm(review.reviewId, 'en')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
});
