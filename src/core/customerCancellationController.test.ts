import { cancellationControllerFixture } from '../test/cancellationController';
import { deferred } from '../test/deferred';
import { response } from '../test/transport';
import { secretKey } from './credentials';
import { CustomerCancellationController } from './customerCancellationController';
import { SessionController } from './sessionController';

it.each([false, true])(
  'requires review and confirmation, persists before dispatch, and acknowledges canonical result (customer=%s)',
  async (customer) => {
    const f = await cancellationControllerFixture(customer);
    f.fetcher.mockResolvedValueOnce(f.reply(f.preparation)).mockImplementationOnce(async () => {
      expect(await f.repository.cancellations.load(f.context, f.principal, f.guard)).toMatchObject({
        intent: { operationId: f.record.intent.operationId, expectedVersion: 7 },
        resolution: null,
      });
      return f.reply(f.canonical);
    });
    await expect(f.controller.confirm(f.record.intent.orderId, 'en')).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await f.offer()).toEqual({
      orderId: f.record.intent.orderId,
      allowed: true,
      reason: null,
    });
    expect(f.createId).not.toHaveBeenCalled();
    expect(await f.controller.saved()).toBeNull();
    expect(await f.controller.confirm(f.record.intent.orderId, 'en')).toEqual({
      operationId: f.record.intent.operationId,
      orderId: f.record.intent.orderId,
      outcome: 'Cancelled',
      reason: null,
    });
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(f.createId).toHaveBeenCalledTimes(1);
    expect(await f.controller.saved()).toMatchObject({ outcome: 'Cancelled' });
    expect(
      (await f.repository.cancellations.load(f.context, f.principal, f.guard))?.resolution,
    ).toEqual(f.canonical);
  },
);

it('keeps an ambiguous action through restart and Unseen, then retries only its original immutable intent', async () => {
  const f = await cancellationControllerFixture();
  f.fetcher
    .mockResolvedValueOnce(f.reply(f.preparation))
    .mockRejectedValueOnce(new Error('lost response'));
  await f.offer();
  await expect(f.controller.confirm(f.record.intent.orderId, 'en')).rejects.toMatchObject({
    reason: 'network',
  });
  const originalWire = f.fetcher.mock.calls[1]?.[1].body;
  const controller = new CustomerCancellationController(
    f.context,
    f.client,
    f.repository,
    f.sessions,
    f.principal,
    f.createId,
    true,
  );
  expect(await controller.saved()).toMatchObject({ outcome: 'Pending' });
  f.fetcher.mockResolvedValueOnce(
    f.reply({ ...f.canonical, outcome: 'Unseen', observedVersion: null }),
  );
  expect(await controller.recover('en')).toMatchObject({ outcome: 'Unseen' });
  expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, f.guard)).toBe(
    true,
  );
  await expect(controller.confirm(f.record.intent.orderId, 'en')).rejects.toThrow();
  f.fetcher.mockResolvedValueOnce(f.reply(f.canonical));
  expect(await controller.retryOriginal(f.record.intent.operationId, 'en')).toMatchObject({
    outcome: 'Cancelled',
  });
  expect(f.fetcher.mock.calls[3]?.[1].body).toBe(originalWire);
  expect(f.createId).toHaveBeenCalledTimes(1);
});

it('does not dispatch after a lost durable-save acknowledgement or withdraw the unresolved hold', async () => {
  const f = await cancellationControllerFixture();
  f.fetcher.mockResolvedValue(f.reply(f.preparation));
  await f.offer();
  const get = f.store.get;
  let persisted = false;
  const set = f.store.set;
  jest.spyOn(f.store, 'set').mockImplementation(async (key, value) => {
    await set(key, value);
    if (key.endsWith('.order-cancellation')) persisted = true;
  });
  const spy = jest.spyOn(f.store, 'get').mockImplementation((key) => {
    if (persisted && key.endsWith('.order-cancellation'))
      return Promise.reject(new Error('lost ack'));
    return get(key);
  });
  await expect(f.controller.confirm(f.record.intent.orderId, 'en')).rejects.toThrow('lost ack');
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  spy.mockRestore();
  expect(await f.controller.saved()).toMatchObject({ outcome: 'Pending' });
  expect(f.createId).toHaveBeenCalledTimes(1);
});

it('coalesces repeated confirmation and hides a result after owner withdrawal', async () => {
  const f = await cancellationControllerFixture();
  const gate = deferred<Response>();
  f.fetcher.mockResolvedValueOnce(f.reply(f.preparation)).mockReturnValueOnce(gate.promise);
  await f.offer();
  const first = f.controller.confirm(f.record.intent.orderId, 'en');
  const second = f.controller.confirm(f.record.intent.orderId, 'en');
  expect(first).toBe(second);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  f.controller.dispose();
  gate.resolve(f.reply(f.canonical));
  await expect(first).rejects.toThrow();
  expect(
    (await f.repository.cancellations.load(f.context, f.principal, f.guard))?.resolution,
  ).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it('refreshes only a read of the saved customer action and never retries submission automatically', async () => {
  const f = await cancellationControllerFixture(true);
  f.fetcher.mockResolvedValueOnce(f.reply(f.preparation)).mockResolvedValueOnce(response({}, 401));
  await f.offer();
  await expect(f.controller.confirm(f.record.intent.orderId, 'en')).rejects.toMatchObject({
    status: 401,
  });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  f.fetcher
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(
      f.reply({
        ...f.session,
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        role: 'Customer',
      }),
    )
    .mockResolvedValueOnce(f.reply(f.canonical));
  expect(await f.controller.recover('en')).toMatchObject({ outcome: 'Cancelled' });
  expect(f.fetcher.mock.calls.slice(2).map(([url]) => new URL(url).pathname)).toEqual([
    '/api/customer-mobile/orders/cancellation/recover',
    '/api/Auth/refresh-token',
    '/api/customer-mobile/orders/cancellation/recover',
  ]);
});

it('retains continuity after rejected customer refresh and requires the same owner to sign back in', async () => {
  const f = await cancellationControllerFixture(true);
  await f.prepare();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(f.controller.recover('en')).rejects.toThrow();
  expect(f.sessions.userId).toBeNull();
  expect(f.sessions.needsPaymentAttention).toBe(true);
  expect(await f.repository.vault.session(f.context, f.principal.id)).toBeNull();
  expect(f.store.values.has(secretKey(f.context, 'order-cancellation', f.principal))).toBe(true);
  const restarted = new SessionController(f.context, f.client, f.repository);
  await restarted.initialize();
  expect(restarted.needsPaymentAttention).toBe(true);
  expect(() => restarted.captureRequestOwner({ kind: 'guest', id: 'basket' })).toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('refuses an earlier confirmation when the stored operation identity has changed', async () => {
  const f = await cancellationControllerFixture();
  await f.prepare();
  await expect(
    f.controller.retryOriginal('88888888-8888-4888-8888-888888888888', 'en'),
  ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
