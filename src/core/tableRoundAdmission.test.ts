import { tableRoundControllerFixture } from '../test/tableRoundController';
import { TableVisitController } from './tableVisitController';
import { secretKey } from './credentials';
import { response } from '../test/transport';
import { tableIdentity } from '../test/tableAccount';

it('refuses another table review before admission when the original round is still pending after local leaving', async () => {
  const f = await tableRoundControllerFixture();
  await f.install();
  await f.repository.tableVisits.leave(
    f.context,
    f.principal,
    tableIdentity.serviceSessionId,
    f.guard,
  );
  const actor = new TableVisitController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.createId,
  );
  await expect(actor.prepare('another-table-qr')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
});
it('rechecks restored original round evidence before the anonymous Join request, independently of local installation refusal', async () => {
  const f = await tableRoundControllerFixture();
  await f.install();
  const key = secretKey(f.context, 'table-round-operation', f.principal);
  const original = f.store.values.get(key)!;
  await f.repository.tableVisits.leave(
    f.context,
    f.principal,
    tableIdentity.serviceSessionId,
    f.guard,
  );
  await f.store.remove(key);
  const actor = new TableVisitController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.createId,
  );
  const review = await actor.prepare('another-table-qr');
  // Restore hostile original evidence directly, rather than through the admission under test.
  await f.store.set(key, original);
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) =>
    url.endsWith('/join') ? response({ success: true, data: tableIdentity }) : normal(url, options),
  );
  await expect(actor.confirm(review.reviewId, 'en')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
});
