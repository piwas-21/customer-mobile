import { tableVisitControllerFixture as fixture } from '../test/tableVisitController';
import { tableAccount, tableIdentity } from '../test/tableAccount';
import { response } from '../test/transport';
import { secretKey } from './credentials';
import { tenantA, tenantB } from '../test/fixtures';
import { deferred } from '../test/deferred';
it.each([false, true])(
  'reviews privately then sends one anonymous admission and publishes only acknowledged minimal visit state: customer=%s',
  async (customer) => {
    const f = await fixture(customer);
    const review = await f.actor.prepare('physical-table-qr');
    expect(review).toEqual({ reviewId: tenantB });
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
    expect(await f.actor.saved()).toBeNull();
    const view = await f.actor.confirm(review.reviewId, 'fr');
    expect(view).toEqual({
      serviceSessionId: tenantA,
      expiresAt: tableIdentity.expiresAt,
      expired: false,
    });
    expect(JSON.stringify(view)).not.toContain(tableIdentity.participantToken);
    expect(JSON.stringify(view)).not.toContain('physical-table-qr');
    await expect(f.actor.confirm(review.reviewId, 'fr')).rejects.toThrow();
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/join'))).toHaveLength(1);
    expect(await f.actor.account('fr')).toEqual(tableAccount());
    expect(f.fetcher.mock.calls.at(-1)![1].headers).not.toHaveProperty('Authorization');
  },
);
it('stale confirmation or dismissal cannot submit or discard a newer reviewed QR', async () => {
  const f = await fixture();
  f.createId
    .mockReturnValueOnce('da96aa10-cc71-481a-b282-9b4bdc535626')
    .mockReturnValueOnce(tenantB);
  const first = await f.actor.prepare('first-qr');
  const second = await f.actor.prepare('second-qr');
  await expect(f.actor.confirm(first.reviewId, 'fr')).rejects.toThrow();
  f.actor.dismiss(first.reviewId);
  await f.actor.confirm(second.reviewId, 'fr');
  const joins = f.fetcher.mock.calls.filter(([url]) => url.endsWith('/join'));
  expect(joins).toHaveLength(1);
  expect(JSON.parse(joins[0]![1].body!)).toEqual({ qrCodeData: 'second-qr' });
});
it('an unknown admission response discards the original review and never silently repeats the join', async () => {
  const f = await fixture();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    url.endsWith('/join') ? Promise.reject(new Error('Response lost')) : normal(url, options),
  );
  const review = await f.actor.prepare('qr');
  await expect(f.actor.confirm(review.reviewId, 'fr')).rejects.toThrow();
  await expect(f.actor.confirm(review.reviewId, 'fr')).rejects.toThrow();
  expect(await f.actor.saved()).toBeNull();
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/join'))).toHaveLength(1);
});
it('restores a durably written participant after a lost secure acknowledgement without another admission', async () => {
  const f = await fixture();
  const review = await f.actor.prepare('qr');
  const key = secretKey(f.context, 'table-participant', f.principal);
  const set = f.store.set;
  const fault = jest.spyOn(f.store, 'set').mockImplementation(async (k, v) => {
    await set(k, v);
    if (k === key) throw new Error('Lost acknowledgement');
  });
  await expect(f.actor.confirm(review.reviewId, 'fr')).rejects.toThrow();
  fault.mockRestore();
  expect(await f.actorFactory().saved()).toMatchObject({
    serviceSessionId: tenantA,
    expired: false,
  });
  expect(await f.actorFactory().account('fr')).toEqual(tableAccount());
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/join'))).toHaveLength(1);
});
it('dismissal while confirmation refresh is paused prevents admission and credential installation', async () => {
  const f = await fixture();
  const review = await f.actor.prepare('qr');
  const entered = deferred<void>();
  const release = deferred<Response>();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => {
    if (url.includes('/bootstrap?')) {
      entered.resolve();
      return release.promise;
    }
    return normal(url, options);
  });
  const pending = f.actor.confirm(review.reviewId, 'fr');
  await entered.promise;
  f.actor.dismiss(review.reviewId);
  release.resolve(response({ success: true, data: f.bootstrap }));
  await expect(pending).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
  expect(await f.actor.saved()).toBeNull();
});
it('explicit local leaving withdraws a late account response and does not close or pay the restaurant visit', async () => {
  const f = await fixture();
  await f.install();
  const entered = deferred<void>();
  const release = deferred<Response>();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => {
    if (url.endsWith('/account')) {
      entered.resolve();
      return release.promise;
    }
    return normal(url, options);
  });
  const pending = f.actor.account('fr');
  await entered.promise;
  await f.actor.leave(tenantA);
  release.resolve(response({ success: true, data: tableAccount() }));
  await expect(pending).rejects.toThrow();
  expect(await f.actor.saved()).toBeNull();
  expect(f.fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
