import { tableVisitControllerFixture as fixture } from '../test/tableVisitController';
import { response } from '../test/transport';
import { tableAccount, tableIdentity } from '../test/tableAccount';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';
import { secretKey } from './credentials';
import { SessionController } from './sessionController';
import { TableVisitController } from './tableVisitController';
it.each(['logout', 'tenant', 'dispose'])(
  'withdraws a paused preparation without admission or stored authority: %s',
  async (mode) => {
    const f = await fixture(true);
    const entered = deferred<void>();
    const release = deferred<Response>();
    f.fetcher.mockImplementation(() => {
      entered.resolve();
      return release.promise;
    });
    const pending = f.actor.prepare('qr');
    await entered.promise;
    if (mode === 'logout') await f.controller.logout();
    else if (mode === 'tenant') f.boundary.select(tenantB);
    else f.actor.dispose();
    release.resolve(response({ success: true, data: f.bootstrap }));
    await expect(pending).rejects.toThrow();
    expect(f.fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
    expect(await f.store.get(secretKey(f.context, 'table-participant', f.principal))).toBeNull();
  },
);
it('a newer read-only review withdraws an earlier paused preparation before publication', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const release = deferred<Response>();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher
    .mockImplementationOnce(() => {
      entered.resolve();
      return release.promise;
    })
    .mockImplementation(normal);
  const first = f.actor.prepare('first-qr');
  const refused = expect(first).rejects.toThrow();
  await entered.promise;
  const second = await f.actor.prepare('second-qr');
  release.resolve(response({ success: true, data: f.bootstrap }));
  await refused;
  await f.actor.confirm(second.reviewId, 'fr');
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/join'))).toHaveLength(1);
  expect(JSON.parse(f.fetcher.mock.calls.find(([url]) => url.endsWith('/join'))![1].body!)).toEqual(
    { qrCodeData: 'second-qr' },
  );
});
it('serializes a paused admission install with logout cleanup and cannot resurrect old private access', async () => {
  const f = await fixture(true);
  const review = await f.actor.prepare('qr');
  const key = secretKey(f.context, 'table-participant', f.principal);
  const entered = deferred<void>();
  const release = deferred<void>();
  const set = f.store.set;
  jest.spyOn(f.store, 'set').mockImplementation(async (k, v) => {
    await set(k, v);
    if (k === key) {
      entered.resolve();
      await release.promise;
    }
  });
  const joining = f.actor.confirm(review.reviewId, 'fr');
  const refusal = expect(joining).rejects.toThrow();
  await entered.promise;
  const logout = f.controller.logout();
  release.resolve();
  await refusal;
  await logout;
  expect(await f.store.get(key)).toBeNull();
  expect(await f.repository.load(f.context)).toBeNull();
});
it('retains original participant access during account withdrawal without enabling a new join or a JWT substitution', async () => {
  const f = await fixture(true);
  await f.install();
  f.controller.dispose();
  const recovery = new SessionController(f.context, f.client, f.repository, false);
  await recovery.initialize();
  expect(recovery.userId).toBe(tenantA);
  expect(recovery.onlyRecoverOrders).toBe(true);
  const actor = new TableVisitController(
    f.context,
    f.client,
    f.repository,
    recovery,
    f.principal,
    f.createId,
  );
  expect(await actor.saved()).toMatchObject({ serviceSessionId: tenantA });
  expect(await actor.account('fr')).toEqual(tableAccount());
  await expect(actor.prepare('another-qr')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.includes('/Auth/'))).toBe(false);
  expect(f.fetcher.mock.calls.at(-1)![1].headers).not.toHaveProperty('Authorization');
  await actor.leave(tenantA);
  expect(await f.repository.tableVisits.read(f.context, f.principal, () => {})).toBeNull();
});
it('refuses expired original reads while preserving local leaving and never creates a replacement visit', async () => {
  const f = await fixture();
  const key = secretKey(f.context, 'table-participant', f.principal);
  const record = await f.install();
  f.store.values.set(
    key,
    JSON.stringify({
      ...record,
      identity: { ...tableIdentity, expiresAt: '2000-01-01T00:00:00Z' },
    }),
  );
  expect(await f.actor.saved()).toMatchObject({ expired: true });
  await expect(f.actor.account('fr')).rejects.toMatchObject({ status: 410 });
  await expect(f.actor.prepare('new-qr')).rejects.toThrow();
  await f.actor.leave(tenantA);
  expect(await f.actor.saved()).toBeNull();
  expect(f.fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
