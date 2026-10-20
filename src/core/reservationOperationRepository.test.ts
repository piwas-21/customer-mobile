import { reservationJournalFixture } from '../test/reservationCreate';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
import { tenantB } from '../test/fixtures';
import { scopedReservationRecord } from './reservationOperationRecord';
it.each([false, true])(
  'stores minimal original proof separately from private input and restores after restart: customer=%p',
  async (customer) => {
    const f = reservationJournalFixture(customer);
    const saved = await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
    const raw = f.store.values.get(secretKey(f.context, 'reservation-operation', f.principal))!;
    expect(raw).not.toContain('guest@example.test');
    expect(raw).not.toContain('Customer request');
    expect(raw).not.toContain('Native guest');
    const restarted = new SessionRepository(f.store);
    expect(await restarted.reservations.load(f.context, f.principal, f.guard)).toEqual(saved);
    expect(await restarted.reservations.intent(f.context, f.principal, f.guard)).toEqual(
      f.prepared.draft,
    );
    await restarted.vault.clear(f.context, f.principal);
    expect(await restarted.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
    expect(await restarted.reservations.load(f.context, f.principal, f.guard)).toEqual(saved);
  },
);
it('refuses a replacement attempt and serializes concurrent installation before either proof can be overwritten', async () => {
  const f = reservationJournalFixture();
  const otherId = 'b193dc57-3d38-47ba-b4b4-3d1cc1e07eb9';
  const other = { ...f.prepared, draft: { ...f.prepared.draft, operationId: otherId } };
  const results = await Promise.allSettled([
    f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard),
    f.repository.reservations.install(
      f.context,
      other,
      { ...f.proof, operationId: otherId },
      f.guard,
    ),
  ]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(
    (await f.repository.reservations.load(f.context, f.principal, f.guard))?.proof.operationId,
  ).toBe(f.proof.operationId);
});
it.each(['intent-write', 'proof-write', 'proof-readback'])(
  'requires exact acknowledgements before installation completes: %s',
  async (mode) => {
    const f = reservationJournalFixture();
    const key = secretKey(
      f.context,
      mode === 'intent-write' ? 'reservation-contact' : 'reservation-operation',
      f.principal,
    );
    if (mode === 'proof-readback') {
      const read = f.store.get;
      jest
        .spyOn(f.store, 'get')
        .mockImplementation((name) =>
          name === key && f.store.values.has(key) ? Promise.resolve('changed') : read(name),
        );
    } else {
      const write = f.store.set;
      jest
        .spyOn(f.store, 'set')
        .mockImplementation((name, value) =>
          name === key
            ? Promise.reject(new Error('Injected secure write failure'))
            : write(name, value),
        );
    }
    await expect(
      f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard),
    ).rejects.toThrow();
  },
);
it('a lost proof-write acknowledgement survives restart without allowing a replacement', async () => {
  const f = reservationJournalFixture();
  const key = secretKey(f.context, 'reservation-operation', f.principal);
  const write = f.store.set;
  const fault = jest.spyOn(f.store, 'set').mockImplementation(async (name, value) => {
    await write(name, value);
    if (name === key) throw new Error('Injected lost acknowledgement after durable write');
  });
  await expect(
    f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard),
  ).rejects.toThrow();
  fault.mockRestore();
  const restarted = new SessionRepository(f.store);
  expect((await restarted.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
    f.proof,
  );
  await expect(
    restarted.reservations.install(f.context, f.prepared, f.proof, f.guard),
  ).rejects.toThrow();
});
it('Unseen is read-only uncertainty and cannot acknowledge or release the original proof', async () => {
  const f = reservationJournalFixture();
  const saved = await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  expect(
    await f.repository.reservations.finish(
      f.context,
      f.principal,
      { ...f.applied, outcome: 'Unseen', reservationId: null },
      f.guard,
    ),
  ).toEqual(saved);
  await expect(
    f.repository.reservations.acknowledge(f.context, f.principal, f.proof.operationId, f.guard),
  ).rejects.toThrow();
  expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toEqual(saved);
});
it('cancellation is acknowledged before contact purge and permanently removes full-create retry input', async () => {
  const f = reservationJournalFixture();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  const cancelling = await f.repository.reservations.requestCancellation(
    f.context,
    f.principal,
    f.proof.operationId,
    f.guard,
  );
  expect(cancelling.cancellationRequested).toBe(true);
  expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
  expect(
    f.store.values.get(secretKey(f.context, 'reservation-contact', f.principal)),
  ).toBeUndefined();
  const restarted = new SessionRepository(f.store);
  expect(
    (await restarted.reservations.load(f.context, f.principal, f.guard))?.cancellationRequested,
  ).toBe(true);
});
it.each(['Applied', 'Cancelled'] as const)(
  'only a canonical %s outcome becomes a durable terminal decision before explicit acknowledgement',
  async (outcome) => {
    const f = reservationJournalFixture();
    await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
    const resolution =
      outcome === 'Applied' ? f.applied : { ...f.applied, outcome, reservationId: null };
    const final = await f.repository.reservations.finish(
      f.context,
      f.principal,
      resolution,
      f.guard,
    );
    expect(final.resolution).toEqual(resolution);
    expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
    const restarted = new SessionRepository(f.store);
    expect(
      (await restarted.reservations.load(f.context, f.principal, f.guard))?.resolution,
    ).toEqual(resolution);
    await expect(
      restarted.reservations.finish(
        f.context,
        f.principal,
        { ...f.applied, outcome: 'Unseen', reservationId: null },
        f.guard,
      ),
    ).rejects.toThrow();
    await restarted.reservations.acknowledge(f.context, f.principal, f.proof.operationId, f.guard);
    expect(await restarted.reservations.load(f.context, f.principal, f.guard)).toBeNull();
  },
);
it('rejects foreign operation results, changed known decisions and forged scope', async () => {
  const f = reservationJournalFixture();
  const saved = await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  await expect(
    f.repository.reservations.finish(
      f.context,
      f.principal,
      { ...f.applied, operationId: f.prepared.sessionId },
      f.guard,
    ),
  ).rejects.toThrow();
  await f.repository.reservations.finish(f.context, f.principal, f.applied, f.guard);
  await expect(
    f.repository.reservations.finish(
      f.context,
      f.principal,
      { ...f.applied, outcome: 'Cancelled', reservationId: null },
      f.guard,
    ),
  ).rejects.toThrow();
  expect(() =>
    scopedReservationRecord(f.context, { kind: 'guest', id: 'another' }, saved),
  ).toThrow();
  expect(() =>
    scopedReservationRecord(f.context, f.principal, { ...saved, environment: 'production' }),
  ).toThrow();
  expect(() =>
    scopedReservationRecord(f.context, f.principal, { ...saved, tenantId: tenantB }),
  ).toThrow();
  expect(() =>
    scopedReservationRecord(f.context, f.principal, {
      ...saved,
      resolution: { ...f.applied, outcome: 'Unseen', reservationId: null },
    }),
  ).toThrow();
  f.boundary.select(tenantB);
  await expect(f.repository.reservations.load(f.context, f.principal, f.guard)).rejects.toThrow();
});
