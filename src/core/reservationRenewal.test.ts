import { reservationRenewalFixture } from '../test/reservationRenewal';
import { reservationControllerFixture } from '../test/reservationController';
import { response } from '../test/transport';
import { reservationCreatePath } from './reservationRequest';
import { refreshReservationSession } from '../api/auth';
import { secretKey } from './credentials';
import { deferred } from '../test/deferred';
it.each(['recover', 'cancel-attempt'] as const)(
  'renews an expired customer JWT once for the exact original %s with accounts disabled',
  async (phase) => {
    const f = await reservationRenewalFixture();
    f.fetcher.mockImplementation((url, options) =>
      Promise.resolve(
        new URL(url).pathname.endsWith('/refresh-token')
          ? f.authentication()
          : options.headers?.Authorization === 'Bearer access'
            ? response({}, 401)
            : f.reply(f.applied),
      ),
    );
    const result =
      phase === 'recover'
        ? await f.actor.recover('en')
        : await f.actor.cancelAttempt(f.proof.operationId, 'en');
    expect(result?.outcome).toBe('Applied');
    expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      reservationCreatePath + '/' + phase,
      '/api/Auth/refresh-token',
      reservationCreatePath + '/' + phase,
    ]);
    const [first, renewal, retry] = f.fetcher.mock.calls;
    expect(first![1].body).toBe(JSON.stringify(f.proof));
    expect(retry![1].body).toBe(first![1].body);
    expect(retry![1].headers).toMatchObject({
      Authorization: 'Bearer renewed-access',
      'X-Session-Id': f.prepared.sessionId,
    });
    expect(renewal![1].headers?.Authorization).toBeUndefined();
    expect(JSON.parse(renewal![1].body!)).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    expect(f.ids).not.toHaveBeenCalled();
  },
);
it('new creation never renews or automatically replays an HTTP401 write', async () => {
  const f = await reservationControllerFixture(true);
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname === reservationCreatePath
      ? Promise.resolve(response({}, 401))
      : normal(url, options),
  );
  await expect(f.controller().create(f.input, 'en')).rejects.toMatchObject({ status: 401 });
  expect(
    f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname === reservationCreatePath),
  ).toHaveLength(1);
  expect(f.fetcher.mock.calls.some(([url]) => url.includes('/refresh-token'))).toBe(false);
  expect((await f.repository.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
    f.proof,
  );
});
it.each(['foreign-operation', 'changed-session', 'changed-token', 'guest', 'terminal'] as const)(
  'refuses unbound reservation renewal before I/O: %s',
  async (mode) => {
    const f = await reservationRenewalFixture();
    const saved = (await f.repository.reservations.load(f.context, f.principal, f.guard))!;
    const record = { ...saved, proof: { ...saved.proof } };
    const token = { userId: f.principal.id, accessToken: 'access', refreshToken: 'refresh' };
    if (mode === 'foreign-operation') record.proof.operationId = f.prepared.sessionId;
    else if (mode === 'changed-session') record.sessionId = f.proof.operationId;
    else if (mode === 'changed-token') token.refreshToken = 'foreign-refresh';
    else if (mode === 'guest') record.principal = { kind: 'guest', id: 'bookings' };
    else record.resolution = f.applied;
    await expect(
      Promise.resolve().then(() =>
        refreshReservationSession(f.client, f.context, token, f.guard, record),
      ),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('rejects a renewed JWT for another customer without replay or replacement', async () => {
  const f = await reservationRenewalFixture();
  f.fetcher.mockImplementation((url) =>
    Promise.resolve(
      url.endsWith('/refresh-token') ? f.authentication(f.prepared.sessionId) : response({}, 401),
    ),
  );
  await expect(f.actor.recover('en')).rejects.toMatchObject({ reason: 'contract' });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect((await f.repository.vault.session(f.context, f.principal.id))?.accessToken).toBe('access');
  expect(f.sessions.userId).toBe(f.principal.id);
});
it('logout while renewal is in flight cannot restore old credentials or publish a reservation result', async () => {
  const f = await reservationRenewalFixture();
  const entered = deferred<void>();
  const reply = deferred<Response>();
  f.fetcher.mockImplementation((url) => {
    if (url.endsWith('/refresh-token')) {
      entered.resolve();
      return reply.promise;
    }
    return Promise.resolve(response({}, 401));
  });
  const pending = f.actor.recover('en');
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;
  await f.sessions.logout();
  reply.resolve(f.authentication());
  await rejected;
  expect(f.sessions.userId).toBeNull();
  expect(await f.repository.vault.session(f.context, f.principal.id)).toBeNull();
  expect(f.store.values.has(secretKey(f.context, 'reservation-operation', f.principal))).toBe(true);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
