import { reservationControllerFixture } from '../test/reservationController';
import { reservationCreatePath } from './reservationRequest';
import { secretKey } from './credentials';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
it.each([false, true])(
  'checks current configuration and durably accepts one original booking: customer=%p',
  async (customer) => {
    const f = await reservationControllerFixture(customer);
    const actor = f.controller();
    const result = await actor.create(f.input, 'en');
    expect(result).toEqual({
      operationId: f.proof.operationId,
      outcome: 'Applied',
      reservationId: f.applied.reservationId,
      cancelling: false,
      canRetry: false,
    });
    expect(Object.keys(result!)).toEqual([
      'operationId',
      'outcome',
      'reservationId',
      'cancelling',
      'canRetry',
    ]);
    expect(f.ids).toHaveBeenCalledTimes(2);
    expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/tenant/mobile/bootstrap',
      reservationCreatePath + '/prepare',
      '/api/tenant/mobile/bootstrap',
      reservationCreatePath,
    ]);
    await expect(actor.create(f.input, 'en')).rejects.toThrow();
    expect(f.ids).toHaveBeenCalledTimes(2);
    expect(await actor.saved()).toEqual(result);
    expect(await f.controller().saved()).toEqual(result);
    await actor.acknowledge(f.proof.operationId);
    expect(await actor.saved()).toBeNull();
  },
);
it('an ambiguous create never mints a new ID; explicit recovery remains pending until the server supplies a terminal decision', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname === reservationCreatePath
      ? Promise.reject(new Error('Injected response loss after dispatch'))
      : normal(url, options),
  );
  await expect(actor.create(f.input, 'en')).rejects.toThrow();
  expect(await actor.saved()).toMatchObject({ outcome: 'Pending', canRetry: true });
  await expect(actor.create(f.input, 'en')).rejects.toThrow();
  const record = await f.repository.reservations.load(f.context, f.principal, f.guard);
  expect(record?.proof.operationId).toBe(f.proof.operationId);
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }));
  expect(await actor.recover('en')).toMatchObject({ outcome: 'Pending' });
  await expect(actor.acknowledge(f.proof.operationId)).rejects.toThrow();
  f.fetcher.mockResolvedValue(f.reply(f.applied));
  expect(await actor.recover('en')).toMatchObject({ outcome: 'Applied' });
  expect(f.ids).toHaveBeenCalledTimes(2);
});
it('explicit retry reuses the saved full intent, proof, session and operation without preparing again', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  expect(await actor.retryOriginal(f.proof.operationId, 'en')).toMatchObject({
    outcome: 'Applied',
  });
  expect(f.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/api/tenant/mobile/bootstrap',
    reservationCreatePath,
  ]);
  expect(f.ids).not.toHaveBeenCalled();
  expect(JSON.parse(f.fetcher.mock.calls[1]![1].body!)).toEqual({
    ...f.prepared.draft,
    payloadHash: f.proof.payloadHash,
    ownerProof: f.proof.ownerProof,
  });
});
it('after contact purge only original recovery or cancellation can resolve the attempt', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  await f.repository.vault.clear(f.context, f.principal);
  expect(await actor.saved()).toMatchObject({ outcome: 'Pending', canRetry: false });
  await expect(actor.retryOriginal(f.proof.operationId, 'en')).rejects.toThrow();
  f.fetcher.mockResolvedValue(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }));
  expect(await actor.cancelAttempt('en')).toMatchObject({ outcome: 'Cancelled', canRetry: false });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(new URL(f.fetcher.mock.calls[0]![0]).pathname).toBe(
    reservationCreatePath + '/cancel-attempt',
  );
  expect(JSON.parse(f.fetcher.mock.calls[0]![1].body!)).toEqual(f.proof);
});
it('lost cancellation acknowledgement leaves durable cancellation intent and cannot later create', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  f.fetcher.mockRejectedValue(new Error('Injected lost cancellation response'));
  await expect(actor.cancelAttempt('en')).rejects.toThrow();
  expect(await f.controller().saved()).toMatchObject({
    outcome: 'Pending',
    cancelling: true,
    canRetry: false,
  });
  await expect(actor.retryOriginal(f.proof.operationId, 'en')).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('a canonical applied decision wins over a cancellation attempt without cancelling the booking', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  expect(await actor.cancelAttempt('en')).toMatchObject({ outcome: 'Applied', cancelling: true });
});
it.each(['capability', 'currency', 'timezone', 'lifecycle'])(
  'refuses new creation on changed current bootstrap: %s',
  async (mode) => {
    const f = await reservationControllerFixture();
    const actor = f.controller();
    if (mode === 'capability') f.bootstrap.capabilities.reservations = 'disabled';
    else if (mode === 'currency') f.bootstrap.currency = 'EUR';
    else if (mode === 'timezone') f.bootstrap.timezone = 'Europe/Paris';
    else f.bootstrap.lifecycle = 'read-only';
    await expect(actor.create(f.input, 'en')).rejects.toThrow();
    expect(f.ids).not.toHaveBeenCalled();
    expect(await actor.saved()).toBeNull();
  },
);
it('refuses changed owner or tenant responses without installing or dispatching a booking', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  const entered = deferred<void>();
  const reply = deferred<Response>();
  f.fetcher.mockImplementationOnce(() => {
    entered.resolve();
    return reply.promise;
  });
  const pending = actor.create(f.input, 'en');
  await entered.promise;
  f.boundary.select(tenantB);
  reply.resolve(f.reply(f.bootstrap));
  await expect(pending).rejects.toThrow();
  expect(f.ids).not.toHaveBeenCalled();
  expect(
    f.store.values.get(secretKey(f.context, 'reservation-operation', f.principal)),
  ).toBeUndefined();
});
