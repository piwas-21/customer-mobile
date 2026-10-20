import { reservationRenewalFixture } from '../test/reservationRenewal';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';
const phases = ['recover', 'cancel-attempt'] as const;
const stages = [
  { name: 'initial private header', read: 1, dispatched: 0 },
  { name: 'renewal private header', read: 2, dispatched: 1 },
  { name: 'post-renewal retry header', read: 3, dispatched: 2 },
] as const;
describe.each(phases)('%s resource withdrawal', (phase) => {
  it.each(stages)('disposal during $name forbids every later dispatch', async (stage) => {
    const f = await reservationRenewalFixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    const read = f.transportVault.capability.bind(f.transportVault);
    let count = 0;
    jest.spyOn(f.transportVault, 'capability').mockImplementation(async (...args) => {
      if (args[1] === 'reservation-operation' && ++count === stage.read) {
        entered.resolve();
        await release.promise;
      }
      return read(...args);
    });
    f.fetcher.mockImplementation((url, options) =>
      Promise.resolve(
        url.endsWith('/refresh-token')
          ? f.authentication()
          : options.headers?.Authorization === 'Bearer access'
            ? response({}, 401)
            : f.reply(f.applied),
      ),
    );
    const pending =
      phase === 'recover'
        ? f.actor.recover('en')
        : f.actor.cancelAttempt(f.proof.operationId, 'en');
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    expect(f.fetcher).toHaveBeenCalledTimes(stage.dispatched);
    f.actor.dispose();
    release.resolve();
    await rejected;
    expect(f.fetcher).toHaveBeenCalledTimes(stage.dispatched);
    expect(
      (await f.repository.reservations.load(f.context, f.principal, f.guard))?.resolution,
    ).toBeNull();
    expect(f.sessions.userId).toBe(f.principal.id);
  });
  it('disposal during the refresh response forbids credential activation and result retry', async () => {
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
    const pending =
      phase === 'recover'
        ? f.actor.recover('en')
        : f.actor.cancelAttempt(f.proof.operationId, 'en');
    const rejected = expect(pending).rejects.toThrow();
    await entered.promise;
    f.actor.dispose();
    reply.resolve(f.authentication());
    await rejected;
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect((await f.repository.vault.session(f.context, f.principal.id))?.accessToken).toBe(
      'access',
    );
    expect(
      (await f.repository.reservations.load(f.context, f.principal, f.guard))?.resolution,
    ).toBeNull();
  });
});
