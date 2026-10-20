import { reservationRenewalFixture } from '../test/reservationRenewal';
import { reservationControllerFixture } from '../test/reservationController';
import { SessionController } from './sessionController';
import { SessionRepository } from './sessionRepository';
import { CustomerReservationController } from './customerReservationController';
import { response } from '../test/transport';
import { tenantB } from '../test/fixtures';
it('rejected renewal preserves an explicit original-customer reminder across restart and reauthentication', async () => {
  const f = await reservationRenewalFixture();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(f.actor.recover('en')).rejects.toMatchObject({ status: 401 });
  expect(f.sessions.userId).toBeNull();
  expect(f.sessions.needsPaymentAttention).toBe(true);
  expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
  const repository = new SessionRepository(f.store);
  const sessions = new SessionController(f.context, f.client, repository);
  await sessions.initialize();
  expect(sessions.needsPaymentAttention).toBe(true);
  expect(() => sessions.captureRequestOwner({ kind: 'guest', id: 'bookings' })).toThrow();
  f.fetcher.mockResolvedValue(f.authentication(tenantB));
  await expect(
    sessions.login({ email: 'other@example.test', password: 'password' }, 'en'),
  ).rejects.toThrow();
  expect(sessions.userId).toBeNull();
  expect(sessions.needsPaymentAttention).toBe(true);
  f.fetcher.mockResolvedValue(f.authentication());
  await sessions.login({ email: 'guest@example.test', password: 'password' }, 'en');
  expect(sessions.needsPaymentAttention).toBe(false);
  const actor = new CustomerReservationController(
    f.context,
    f.client,
    repository,
    sessions,
    f.principal,
    f.ids,
    f.bootstrap,
  );
  expect(await actor.saved()).toMatchObject({
    operationId: f.proof.operationId,
    outcome: 'Pending',
    canRetry: false,
  });
  f.fetcher.mockResolvedValue(f.reply(f.applied));
  expect(await actor.recover('en')).toMatchObject({ outcome: 'Applied' });
});
it('only an explicit separate-customer decision releases automatic-withdrawal guest access and keeps original proof', async () => {
  const f = await reservationRenewalFixture();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(f.actor.recover('en')).rejects.toThrow();
  const restarted = new SessionController(
    f.context,
    f.client,
    new SessionRepository(f.store),
    false,
    true,
  );
  await restarted.initialize();
  expect(restarted.needsPaymentAttention).toBe(true);
  expect(() => restarted.captureRequestOwner({ kind: 'guest', id: 'bookings' })).toThrow();
  await restarted.continueForAnotherCustomer();
  expect(restarted.needsPaymentAttention).toBe(false);
  expect(() => restarted.captureRequestOwner({ kind: 'guest', id: 'bookings' })).not.toThrow();
  expect((await f.repository.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
    f.proof,
  );
});
it('a delayed confirmation for A cannot stop or purge B on the same controller after A is dismissed', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  const staleOperation = f.proof.operationId;
  await f.repository.reservations.finish(f.context, f.principal, f.applied, f.guard);
  await actor.acknowledge(staleOperation);
  const next = { ...f.prepared, draft: { ...f.prepared.draft, operationId: f.prepared.sessionId } };
  const nextProof = { ...f.proof, operationId: next.draft.operationId };
  const saved = await f.repository.reservations.install(f.context, next, nextProof, f.guard);
  await expect(actor.cancelAttempt(staleOperation, 'en')).rejects.toThrow();
  expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toEqual(saved);
  expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toEqual(
    next.draft,
  );
  expect(f.fetcher).not.toHaveBeenCalled();
});
