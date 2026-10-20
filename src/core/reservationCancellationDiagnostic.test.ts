import { reservationCancellationControllerFixture as fixture } from '../test/reservationCancellationController';
import { reservationOperationRecordSchema } from './reservationOperationRecord';
import { secretKey } from './credentials';
import { response } from '../test/transport';
it.each(['throw-before-save', 'silent-lost-save'])(
  'known refusal stays recovery-only when diagnostic persistence fails: %s',
  async (mode) => {
    const f = await fixture();
    const actor = f.controller();
    const review = await actor.prepareCancellation(f.applied.reservationId, 'en');
    const key = secretKey(f.context, 'reservation-operation', f.principal);
    const write = f.store.set;
    jest.spyOn(f.store, 'set').mockImplementation((name, value) => {
      if (
        name === key &&
        reservationOperationRecordSchema.parse(JSON.parse(value)).cancellation?.retryBlocked
      )
        return mode === 'throw-before-save'
          ? Promise.reject(new Error('Secure storage refused'))
          : Promise.resolve();
      return write(name, value);
    });
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((url, options) =>
      url.endsWith('/submit')
        ? Promise.resolve(response({}, 409))
        : url.endsWith('/recover')
          ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }))
          : url.endsWith('/cancel-attempt')
            ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }))
            : normal(url, options),
    );
    await expect(actor.confirmCancellation(review.operationId, 'en')).rejects.toMatchObject({
      status: 409,
    });
    expect(await actor.saved()).toMatchObject({
      cancellation: true,
      retryBlocked: true,
      canRetry: false,
      outcome: 'Pending',
    });
    expect(
      (await f.repository.reservations.load(f.context, f.principal, f.guard))?.cancellation
        ?.retryBlocked,
    ).toBeUndefined();
    const restored = f.controller();
    expect(await restored.saved()).toMatchObject({
      cancellation: true,
      canRetry: false,
      outcome: 'Pending',
    });
    const requests = f.fetcher.mock.calls.length;
    await expect(actor.retryOriginal(review.operationId, 'en')).rejects.toThrow();
    await expect(restored.retryOriginal(review.operationId, 'en')).rejects.toThrow();
    await expect(restored.prepareCancellation(f.applied.reservationId, 'en')).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(requests);
    expect(await restored.recover('en')).toMatchObject({ outcome: 'Pending', canRetry: false });
    await expect(restored.acknowledge(review.operationId)).rejects.toThrow();
    expect(await restored.cancelAttempt(review.operationId, 'en')).toMatchObject({
      outcome: 'Cancelled',
    });
    expect(await restored.acknowledge(review.operationId)).toBeNull();
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
    expect(f.ids).toHaveBeenCalledTimes(2);
  },
);
