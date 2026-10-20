import { reservationCancellationControllerFixture as fixture } from '../test/reservationCancellationController';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
it.each(['lost-save-ack', 'changed-readback'] as const)(
  'never submits without exact durable cancellation authority: %s',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
    const key = secretKey(f.context, 'reservation-operation', f.principal);
    const write = f.store.set;
    const read = f.store.get;
    const fault =
      mode === 'lost-save-ack'
        ? jest.spyOn(f.store, 'set').mockImplementation(async (name, value) => {
            await write(name, value);
            if (name === key) throw new Error('Lost secure acknowledgement');
          })
        : jest
            .spyOn(f.store, 'get')
            .mockImplementation((name) =>
              name === key && f.store.values.has(key) ? Promise.resolve('changed') : read(name),
            );
    await expect(actor.confirmCancellation(review.operationId, 'en')).rejects.toThrow();
    fault.mockRestore();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    const restarted = new SessionRepository(f.store);
    expect((await restarted.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
      f.cancellation.proof,
    );
    expect(await restarted.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
    await expect(actor.prepareCancellation(f.applied.reservationId, 'en')).rejects.toThrow();
    expect(await actor.recover('en')).toMatchObject({ cancellation: true, outcome: 'Applied' });
  },
);
it('refuses cancellation installation when orphaned private contact removal is not acknowledged', async () => {
  const f = await fixture();
  const actor = f.controller();
  const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
  const key = secretKey(f.context, 'reservation-contact', f.principal);
  await f.store.set(key, 'unrelated private contact');
  const remove = f.store.remove;
  jest
    .spyOn(f.store, 'remove')
    .mockImplementation((name) => (name === key ? Promise.resolve() : remove(name)));
  await expect(actor.confirmCancellation(review.operationId, 'en')).rejects.toThrow();
  expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
  expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
});
