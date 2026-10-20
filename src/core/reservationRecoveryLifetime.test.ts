import { reservationControllerFixture } from '../test/reservationController';
import { CustomerReservationController } from './customerReservationController';
import { SessionController } from './sessionController';
import { SessionRepository } from './sessionRepository';
import { reservationCreatePath } from './reservationRequest';
import { secretKey } from './credentials';
import { deferred } from '../test/deferred';
it('a signed-in original request restores its JWT only for minimal recovery after accounts and bookings are disabled', async () => {
  const f = await reservationControllerFixture(true);
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  f.sessions.dispose();
  const repository = new SessionRepository(f.store);
  const sessions = new SessionController(f.context, f.client, repository, false, true);
  expect(await sessions.initialize()).toBe(f.principal.id);
  expect(sessions.onlyRecoverOrders).toBe(true);
  const bootstrap = {
    ...f.bootstrap,
    lifecycle: 'read-only' as const,
    capabilities: { reservations: 'disabled' as const, accounts: 'disabled' as const },
  };
  const actor = new CustomerReservationController(
    f.context,
    f.client,
    repository,
    sessions,
    f.principal,
    f.ids,
    bootstrap,
  );
  expect(await actor.saved()).toMatchObject({ outcome: 'Pending', canRetry: false });
  expect(() => actor.create(f.input, 'en')).toThrow();
  expect(() => actor.retryOriginal(f.proof.operationId, 'en')).toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(await actor.recover('en')).toMatchObject({ outcome: 'Applied' });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const [url, request] = f.fetcher.mock.calls[0]!;
  expect(new URL(url).pathname).toBe(reservationCreatePath + '/recover');
  expect(JSON.parse(request.body!)).toEqual(f.proof);
  expect(request.headers).toMatchObject({
    Authorization: 'Bearer access',
    'X-Session-Id': f.prepared.sessionId,
  });
  await actor.acknowledge(f.proof.operationId);
  const ordinary = new SessionController(f.context, f.client, repository, false, true);
  expect(await ordinary.initialize()).toBeNull();
});
it('an unknown currency refuses creation before minting IDs or sending preparation', async () => {
  const f = await reservationControllerFixture();
  const actor = new CustomerReservationController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.ids,
    { ...f.bootstrap, currency: null },
  );
  expect(() => actor.create(f.input, 'en')).toThrow();
  expect(f.ids).not.toHaveBeenCalled();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('a late prepared proof after logout cannot persist private input or dispatch a booking', async () => {
  const f = await reservationControllerFixture(true);
  const actor = f.controller();
  const entered = deferred<void>();
  const response = deferred<Response>();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => {
    if (new URL(url).pathname === reservationCreatePath + '/prepare') {
      entered.resolve();
      return response.promise;
    }
    return normal(url, options);
  });
  const pending = actor.create(f.input, 'en');
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;
  await f.sessions.logout();
  response.resolve(f.reply(f.proof));
  await rejected;
  expect(
    f.fetcher.mock.calls.some(([url]) => new URL(url).pathname === reservationCreatePath),
  ).toBe(false);
  expect(f.store.values.has(secretKey(f.context, 'reservation-contact', f.principal))).toBe(false);
  expect(f.store.values.has(secretKey(f.context, 'reservation-operation', f.principal))).toBe(
    false,
  );
});
