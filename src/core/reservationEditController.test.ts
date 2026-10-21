import { reservationEditControllerFixture as fixture } from '../test/reservationEditController';
import { reservationControllerFixture } from '../test/reservationController';
import { secretKey } from './credentials';
import { reservationEditPath } from './reservationPaths';
import {
  reservationOperationRecordSchema,
  reservationPreparationSchema,
} from './reservationOperationRecord';
import { reservationEditPreparationSchema } from './reservationEditPreparation';
import { SessionRepository } from './sessionRepository';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
it('reviews without writes then acknowledges original full intent and minimal proof before one exact submission', async () => {
  const f = await fixture();
  const actor = f.controller();
  const review = await actor.prepareEdit(f.input, 'en');
  expect(review).toEqual({
    operationId: f.edit.proof.operationId,
    original: f.edit.original,
    proposed: f.edit.proposed,
    timeZone: 'Europe/Zurich',
  });
  expect(Object.keys(review)).toEqual(['operationId', 'original', 'proposed', 'timeZone']);
  expect(await actor.saved()).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const submit = actor.confirmEdit(review.operationId, 'en');
  expect(actor.confirmEdit(review.operationId, 'en')).toBe(submit);
  await expect(submit).resolves.toMatchObject({
    edit: true,
    outcome: 'Applied',
    reservationId: f.applied.reservationId,
    canRetry: false,
  });
  const calls = f.fetcher.mock.calls.filter(
    ([url]) => new URL(url).pathname === reservationEditPath + '/submit',
  );
  expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0]![1].body!)).toEqual({
    ...f.prepared.draft,
    payloadHash: f.edit.proof.payloadHash,
    ownerProof: f.edit.proof.ownerProof,
  });
  const record = JSON.parse(
    f.store.values.get(secretKey(f.context, 'reservation-operation', f.principal))!,
  );
  expect(record.edit).toEqual({
    reservationId: f.applied.reservationId,
    timeZone: 'Europe/Zurich',
  });
  expect(Object.keys(record)).not.toContain('draft');
  expect(JSON.stringify(record)).not.toContain('guest@example.test');
  expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
  expect(await f.controller().saved()).toMatchObject({ edit: true, outcome: 'Applied' });
});
it.each(['lost-response', 'conflict'] as const)(
  'preserves one ambiguous edit across restart, Unseen, and explicit original stop: %s',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((url, options) =>
      new URL(url).pathname.endsWith('/submit')
        ? mode === 'conflict'
          ? Promise.resolve(response({}, 409))
          : Promise.reject(new Error('Lost response'))
        : normal(url, options),
    );
    const review = await actor.prepareEdit(f.input, 'en');
    await expect(actor.confirmEdit(review.operationId, 'en')).rejects.toThrow();
    const restored = f.controller();
    expect(await restored.saved()).toMatchObject({
      edit: true,
      outcome: 'Pending',
      canRetry: false,
    });
    await expect(restored.retryOriginal(review.operationId, 'en')).rejects.toThrow();
    await expect(restored.confirmEdit(review.operationId, 'en')).rejects.toThrow();
    await expect(restored.prepareEdit(f.input, 'en')).rejects.toThrow();
    await expect(restored.prepareCancellation(f.applied.reservationId, 'en')).rejects.toThrow();
    f.fetcher.mockImplementation((url, options) =>
      new URL(url).pathname.endsWith('/recover')
        ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }))
        : new URL(url).pathname.endsWith('/cancel-attempt')
          ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }))
          : normal(url, options),
    );
    expect(await restored.recover('en')).toMatchObject({
      edit: true,
      outcome: 'Pending',
      canRetry: false,
    });
    await expect(restored.acknowledge(review.operationId)).rejects.toThrow();
    expect(await restored.cancelAttempt(review.operationId, 'en')).toMatchObject({
      edit: true,
      outcome: 'Cancelled',
    });
    expect(await restored.acknowledge(review.operationId)).toBeNull();
    expect(
      f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/submit')),
    ).toHaveLength(1);
    expect(f.ids).toHaveBeenCalledTimes(2);
  },
);
it.each(['intent-ack', 'proof-ack'] as const)(
  'never submits before exact durable %s',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const review = await actor.prepareEdit(f.input, 'en');
    const key = secretKey(
      f.context,
      mode === 'intent-ack' ? 'reservation-contact' : 'reservation-operation',
      f.principal,
    );
    const write = f.store.set;
    const fault = jest.spyOn(f.store, 'set').mockImplementation(async (name, value) => {
      await write(name, value);
      if (name === key) throw new Error('Lost acknowledgement');
    });
    await expect(actor.confirmEdit(review.operationId, 'en')).rejects.toThrow();
    fault.mockRestore();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    const restarted = new SessionRepository(f.store);
    const saved = await restarted.reservations.load(f.context, f.principal, f.guard);
    expect(saved?.edit !== undefined).toBe(mode === 'proof-ack');
    await expect(actor.confirmEdit(review.operationId, 'en')).rejects.toThrow();
  },
);
it.each(['logout', 'tenant', 'disposed'] as const)(
  'withdraws a paused editor preparation before publication: %s',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const entered = deferred<void>();
    const reply = deferred<Response>();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((url, options) => {
      if (!url.endsWith('/prepare')) return normal(url, options);
      entered.resolve();
      return reply.promise;
    });
    const pending = actor.prepareEdit(f.input, 'en');
    await entered.promise;
    if (mode === 'logout') await f.sessions.logout();
    else if (mode === 'tenant') f.boundary.select(tenantB);
    else actor.dispose();
    reply.resolve(f.reply(f.edit));
    await expect(pending).rejects.toThrow();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    expect(f.store.values.has(secretKey(f.context, 'reservation-operation', f.principal))).toBe(
      false,
    );
  },
);
it('refuses guest edits, mixed action records and edit bodies masquerading as ordinary creation', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  expect(() =>
    actor.prepareEdit({ ...f.input, reservationId: f.applied.reservationId }, 'en'),
  ).toThrow();
  await expect(actor.confirmEdit(f.proof.operationId, 'en')).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
  const customer = await fixture();
  const record = await customer.install();
  expect(
    reservationOperationRecordSchema.safeParse({
      ...record,
      principal: { kind: 'guest', id: 'bookings' },
    }).success,
  ).toBe(false);
  expect(
    reservationOperationRecordSchema.safeParse({ ...record, cancellation: record.edit }).success,
  ).toBe(false);
  expect(reservationPreparationSchema.safeParse(customer.prepared).success).toBe(false);
  expect(reservationEditPreparationSchema.safeParse(customer.prepared).success).toBe(true);
});
