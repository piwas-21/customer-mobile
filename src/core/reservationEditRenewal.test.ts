import { reservationEditControllerFixture as fixture } from '../test/reservationEditController';
import { SessionController } from './sessionController';
import { SessionRepository } from './sessionRepository';
import { CustomerReservationController } from './customerReservationController';
import { response } from '../test/transport';
import { reservationEditPath } from './reservationPaths';
async function recoveryFixture() {
  const f = await fixture();
  await f.install();
  f.sessions.dispose();
  const repository = new SessionRepository(f.store);
  const sessions = new SessionController(f.context, f.client, repository, false, true);
  await sessions.initialize();
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
  return { ...f, repository, sessions, actor };
}
it.each(['recover', 'cancel-attempt'] as const)(
  'renews only the original edit %s once after account and module withdrawal',
  async (phase) => {
    const f = await recoveryFixture();
    f.fetcher.mockImplementation((url, options) =>
      Promise.resolve(
        url.endsWith('/refresh-token')
          ? f.reply({
              userId: f.principal.id,
              role: 'Customer',
              accessToken: 'renewed-access',
              refreshToken: 'renewed-refresh',
            })
          : options.headers?.Authorization === 'Bearer access'
            ? response({}, 401)
            : f.reply(f.applied),
      ),
    );
    const result =
      phase === 'recover'
        ? await f.actor.recover('en')
        : await f.actor.cancelAttempt(f.proof.operationId, 'en');
    expect(result).toMatchObject({ edit: true, outcome: 'Applied' });
    expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      reservationEditPath + '/' + phase,
      '/api/Auth/refresh-token',
      reservationEditPath + '/' + phase,
    ]);
    expect(f.fetcher.mock.calls[0]![1].body).toBe(JSON.stringify(f.edit.proof));
    expect(f.fetcher.mock.calls[2]![1].body).toBe(f.fetcher.mock.calls[0]![1].body);
    expect(f.fetcher.mock.calls[2]![1].headers).toMatchObject({
      Authorization: 'Bearer renewed-access',
      'X-Session-Id': f.prepared.sessionId,
    });
    expect(f.ids).not.toHaveBeenCalled();
  },
);
it('never refreshes or resubmits the initial edited body after HTTP401', async () => {
  const f = await fixture();
  const actor = f.controller();
  const review = await actor.prepareEdit(f.input, 'en');
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    url.endsWith('/submit') ? Promise.resolve(response({}, 401)) : normal(url, options),
  );
  await expect(actor.confirmEdit(review.operationId, 'en')).rejects.toMatchObject({ status: 401 });
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/refresh-token'))).toBe(false);
  expect((await f.repository.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
    f.edit.proof,
  );
});
it('rejected edit renewal purges contact and credentials while preserving the customer reminder and original proof', async () => {
  const f = await recoveryFixture();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(f.actor.recover('en')).rejects.toMatchObject({ status: 401 });
  expect(f.sessions.userId).toBeNull();
  expect(f.sessions.needsPaymentAttention).toBe(true);
  const repository = new SessionRepository(f.store);
  const sessions = new SessionController(f.context, f.client, repository, false, true);
  await sessions.initialize();
  expect(sessions.needsPaymentAttention).toBe(true);
  expect(() => sessions.captureRequestOwner({ kind: 'guest', id: 'bookings' })).toThrow();
  expect((await repository.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
    f.edit.proof,
  );
  expect(await repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
});
