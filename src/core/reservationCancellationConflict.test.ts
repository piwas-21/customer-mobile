import { reservationCancellationControllerFixture as fixture } from '../test/reservationCancellationController';
import { response } from '../test/transport';
import { resolveReservationAttempt } from '../api/reservationCreate';
import { captureReservationRequest } from './reservationRequest';
import { reservationCancellationPath } from './reservationPaths';
import { tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
it('retains a stale reviewed cancellation across restart, blocks impossible retries and only releases after explicit original stop', async () => {
  const f = await fixture();
  const actor = f.controller();
  const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname.endsWith('/submit')
      ? Promise.resolve(response({}, 409))
      : normal(url, options),
  );
  await expect(actor.confirmCancellation(review.operationId, 'en')).rejects.toThrow();
  const record = await f.repository.reservations.load(f.context, f.principal, f.guard);
  expect(record?.cancellation?.retryBlocked).toBe(true);
  const restored = f.controller();
  expect(await restored.saved()).toMatchObject({
    outcome: 'Pending',
    cancellation: true,
    canRetry: false,
  });
  const calls = f.fetcher.mock.calls.length;
  await expect(restored.retryOriginal(review.operationId, 'en')).rejects.toThrow();
  await expect(restored.prepareCancellation(f.applied.reservationId, 'en')).rejects.toThrow();
  await expect(
    resolveReservationAttempt(f.client, f.context, record!, 'submit', f.guard, 'en'),
  ).rejects.toThrow();
  expect(() =>
    captureReservationRequest(f.context, reservationCancellationPath + '/submit', {
      method: 'POST',
      credentials: 'reservation-operation',
      principal: f.principal,
      expectedReservationRecord: record!,
      body: record!.proof,
      assertCurrent: f.guard,
    }),
  ).toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(calls);
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname.endsWith('/recover')
      ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }))
      : new URL(url).pathname.endsWith('/cancel-attempt')
        ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }))
        : normal(url, options),
  );
  expect(await restored.recover('en')).toMatchObject({ outcome: 'Pending', canRetry: false });
  await expect(restored.acknowledge(review.operationId)).rejects.toThrow();
  expect(await restored.cancelAttempt(review.operationId, 'en')).toMatchObject({
    outcome: 'Cancelled',
  });
  expect(await restored.acknowledge(review.operationId)).toBeNull();
  expect(await restored.saved()).toBeNull();
  expect(f.ids).toHaveBeenCalledTimes(2);
});
it('a delayed conflict for A cannot mark B as stale', async () => {
  const f = await fixture();
  const actor = f.controller();
  const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
  await actor.confirmCancellation(review.operationId, 'en');
  const record = (await f.repository.reservations.load(f.context, f.principal, f.guard))!;
  await actor.acknowledge(review.operationId);
  const replacement = {
    ...record,
    proof: { ...record.proof, operationId: tenantB },
    resolution: null,
  };
  await f.store.set(
    secretKey(f.context, 'reservation-operation', f.principal),
    JSON.stringify(replacement),
  );
  await expect(
    f.repository.reservations.blockMutationRetry(f.context, record, f.guard),
  ).rejects.toThrow();
  expect(
    (await f.repository.reservations.load(f.context, f.principal, f.guard))?.cancellation
      ?.retryBlocked,
  ).toBeUndefined();
});
