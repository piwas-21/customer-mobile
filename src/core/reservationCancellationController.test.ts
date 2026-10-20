import { reservationCancellationControllerFixture as fixture } from '../test/reservationCancellationController';
import { reservationControllerFixture } from '../test/reservationController';
import { reservationCancellationPath } from './reservationPaths';
import { secretKey } from './credentials';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
it('requires a fresh read and explicit confirmation, then persists only minimal authority before submitting once', async () => {
  const f = await fixture();
  const actor = f.controller();
  const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
  expect(review).toEqual({
    operationId: f.proof.operationId,
    reservation: f.cancellation.reservation,
    timeZone: 'Europe/Zurich',
  });
  expect(Object.keys(review)).toEqual(['operationId', 'reservation', 'timeZone']);
  expect(await actor.saved()).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const submit = actor.confirmCancellation(review.operationId, 'en');
  expect(actor.confirmCancellation(review.operationId, 'en')).toBe(submit);
  expect(await submit).toMatchObject({
    cancellation: true,
    outcome: 'Applied',
    reservationId: f.applied.reservationId,
    canRetry: false,
  });
  const calls = f.fetcher.mock.calls.filter(
    ([url]) => new URL(url).pathname === reservationCancellationPath + '/submit',
  );
  expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0]![1].body!)).toEqual(f.cancellation.proof);
  const saved = f.store.values.get(secretKey(f.context, 'reservation-operation', f.principal))!;
  expect(saved).not.toContain('Private customer request');
  expect(saved).not.toContain('customerEmail');
  expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
  expect(await f.controller().saved()).toMatchObject({ cancellation: true, outcome: 'Applied' });
});
it('lost submission retains the original action without minting another and explicit retry preserves its exact proof', async () => {
  const f = await fixture();
  const actor = f.controller();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname.endsWith('/submit')
      ? Promise.reject(new Error('Lost response'))
      : normal(url, options),
  );
  const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
  await expect(actor.confirmCancellation(review.operationId, 'en')).rejects.toThrow();
  expect(await actor.saved()).toMatchObject({
    cancellation: true,
    outcome: 'Pending',
    canRetry: true,
  });
  await expect(actor.prepareCancellation(f.applied.reservationId, 'en')).rejects.toThrow();
  await expect(actor.create(f.input, 'en')).rejects.toThrow();
  expect(f.ids).toHaveBeenCalledTimes(2);
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname.endsWith('/recover')
      ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }))
      : normal(url, options),
  );
  expect(await actor.recover('en')).toMatchObject({ outcome: 'Pending' });
  await expect(actor.acknowledge(review.operationId)).rejects.toThrow();
  expect(await actor.retryOriginal(review.operationId, 'en')).toMatchObject({
    cancellation: true,
    outcome: 'Applied',
  });
  const submits = f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/submit'));
  expect(submits).toHaveLength(2);
  expect(submits[0]![1].body).toEqual(submits[1]![1].body);
  expect(
    f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/prepare')),
  ).toHaveLength(1);
});
it('stale A confirmation or dismissal cannot replace, submit or discard the reviewed B action', async () => {
  const f = await fixture();
  const actor = f.controller();
  f.ids.mockReturnValueOnce('da96aa10-cc71-481a-b282-9b4bdc535626').mockReturnValueOnce(tenantB);
  const first = await actor.prepareCancellation(f.applied.reservationId, 'en');
  const secondResponse = {
    ...f.cancellation,
    proof: { ...f.cancellation.proof, operationId: tenantB },
    reservation: {
      ...f.cancellation.reservation,
      reservationId: tenantB,
      reservationDate: '2030-05-18',
    },
  };
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname.endsWith('/prepare')
      ? Promise.resolve(f.reply(secondResponse))
      : new URL(url).pathname.endsWith('/submit')
        ? Promise.resolve(f.reply({ ...f.applied, operationId: tenantB, reservationId: tenantB }))
        : normal(url, options),
  );
  const second = await actor.prepareCancellation(tenantB, 'en');
  await expect(actor.confirmCancellation(first.operationId, 'en')).rejects.toThrow();
  actor.dismissCancellation(first.operationId);
  expect(await actor.saved()).toBeNull();
  expect(
    f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/submit')),
  ).toHaveLength(0);
  expect(await actor.confirmCancellation(second.operationId, 'en')).toMatchObject({
    outcome: 'Applied',
    operationId: tenantB,
    reservationId: tenantB,
  });
});
it.each(['disposed', 'tenant', 'logout'])(
  'withdraws a paused preparation before candidate publication: %s',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const entered = deferred<void>();
    const reply = deferred<Response>();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((url, options) => {
      if (!new URL(url).pathname.endsWith('/prepare')) return normal(url, options);
      entered.resolve();
      return reply.promise;
    });
    const pending = actor.prepareCancellation(f.applied.reservationId, 'en');
    await entered.promise;
    if (mode === 'disposed') actor.dispose();
    else if (mode === 'tenant') f.boundary.select(tenantB);
    else await f.sessions.logout();
    reply.resolve(f.reply(f.cancellation));
    await expect(pending).rejects.toThrow();
    expect(f.store.values.has(secretKey(f.context, 'reservation-operation', f.principal))).toBe(
      false,
    );
  },
);
it('guest access cannot prepare or confirm another customer booking', async () => {
  const f = await reservationControllerFixture();
  const actor = f.controller();
  expect(() => actor.prepareCancellation(f.applied.reservationId, 'en')).toThrow();
  await expect(actor.confirmCancellation(f.proof.operationId, 'en')).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.ids).not.toHaveBeenCalled();
});
it.each(['capability', 'accounts', 'currency', 'timezone', 'lifecycle'])(
  'refuses confirmation before persistence after current restaurant configuration changes: %s',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
    if (mode === 'capability') f.bootstrap.capabilities.reservations = 'disabled';
    else if (mode === 'accounts') f.bootstrap.capabilities.accounts = 'disabled';
    else if (mode === 'currency') f.bootstrap.currency = 'EUR';
    else if (mode === 'timezone') f.bootstrap.timezone = 'Europe/Paris';
    else f.bootstrap.lifecycle = 'read-only';
    await expect(actor.confirmCancellation(review.operationId, 'en')).rejects.toThrow();
    expect(await actor.saved()).toBeNull();
    expect(f.ids).toHaveBeenCalledTimes(2);
    expect(
      f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/submit')),
    ).toHaveLength(0);
  },
);
