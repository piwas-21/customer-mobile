import { reservationJournalFixture } from '../test/reservationCreate';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
it('logout requires acknowledged contact deletion and keeps only minimal recovery proof', async () => {
  const f = reservationJournalFixture();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  const contactKey = secretKey(f.context, 'reservation-contact', f.principal);
  const remove = f.store.remove;
  const fault = jest
    .spyOn(f.store, 'remove')
    .mockImplementation((key) => (key === contactKey ? Promise.resolve() : remove(key)));
  await expect(f.repository.vault.clear(f.context, f.principal)).rejects.toThrow(
    'Credential removal incomplete',
  );
  expect(f.store.values.get(contactKey)).toContain('guest@example.test');
  fault.mockRestore();
  await f.repository.vault.clear(f.context, f.principal);
  expect(f.store.values.has(contactKey)).toBe(false);
  expect((await f.repository.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
    f.proof,
  );
});
it.each(['contact', 'proof'] as const)(
  'dismissal refuses a false %s deletion acknowledgement and retains the known decision',
  async (kind) => {
    const f = reservationJournalFixture();
    await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
    await f.repository.reservations.finish(f.context, f.principal, f.applied, f.guard);
    if (kind === 'contact')
      f.store.values.set(
        secretKey(f.context, 'reservation-contact', f.principal),
        'residual-private-input',
      );
    const key = secretKey(
      f.context,
      kind === 'contact' ? 'reservation-contact' : 'reservation-operation',
      f.principal,
    );
    const remove = f.store.remove;
    const fault = jest
      .spyOn(f.store, 'remove')
      .mockImplementation((name) => (name === key ? Promise.resolve() : remove(name)));
    await expect(
      f.repository.reservations.acknowledge(f.context, f.principal, f.proof.operationId, f.guard),
    ).rejects.toThrow('Secure value removal incomplete');
    const restarted = new SessionRepository(f.store);
    expect(
      (await restarted.reservations.load(f.context, f.principal, f.guard))?.resolution,
    ).toEqual(f.applied);
    fault.mockRestore();
    await restarted.reservations.acknowledge(f.context, f.principal, f.proof.operationId, f.guard);
    expect(await restarted.reservations.load(f.context, f.principal, f.guard)).toBeNull();
  },
);
