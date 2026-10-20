import { z } from 'zod';
import { SessionController } from './sessionController';
import { BasketWorkspace } from './basketWorkspace';
import { paymentFixture, paymentDecision } from '../test/customerPayment';
import { session, authResponse } from '../test/sessions';
import { response } from '../test/transport';
import { basketOperationId } from '../test/basketOperations';
import { secretKey } from './credentials';
import { tenantB } from '../test/fixtures';
async function rejectedRefresh() {
  const f = await paymentFixture(true);
  const controller = new SessionController(f.context, f.client, f.repository);
  await controller.initialize();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(controller.orders.payment(f.record, 'en')).rejects.toMatchObject({ status: 401 });
  return { ...f, controller };
}
function guestBasket(f: Awaited<ReturnType<typeof rejectedRefresh>>, controller = f.controller) {
  return new BasketWorkspace(
    f.context,
    f.client,
    f.repository,
    controller,
    { kind: 'guest', id: 'basket' },
    () => basketOperationId,
  );
}
it('rejected refresh preserves a visible continuity hold across restart without retaining credentials', async () => {
  const f = await rejectedRefresh();
  expect(f.controller.userId).toBeNull();
  expect(f.controller.needsCleanup).toBe(false);
  expect(f.controller.needsPaymentAttention).toBe(true);
  expect(await f.repository.load(f.context)).toBeNull();
  expect(await f.repository.vault.session(f.context, session.userId)).toBeNull();
  expect(() => guestBasket(f)).toThrow();
  const restarted = new SessionController(f.context, f.client, f.repository);
  await restarted.initialize();
  expect(restarted.needsPaymentAttention).toBe(true);
  expect(() => guestBasket(f, restarted)).toThrow();
  expect(await f.repository.payments.load(f.context, f.principal, () => {})).toEqual(f.record);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('reauthentication requires the original owner until an explicit separate-customer transition', async () => {
  const f = await rejectedRefresh();
  f.fetcher.mockResolvedValue(authResponse({ ...session, userId: tenantB }));
  await expect(
    f.controller.login({ email: 'fixture@example.test', password: 'fixture-password' }, 'en'),
  ).rejects.toMatchObject({ status: 401 });
  expect(f.controller.needsPaymentAttention).toBe(true);
  expect(await f.repository.load(f.context)).toBeNull();
  f.fetcher.mockResolvedValue(authResponse(session));
  await f.controller.login({ email: 'fixture@example.test', password: 'fixture-password' }, 'en');
  expect(f.controller.userId).toBe(session.userId);
  expect(f.controller.needsPaymentAttention).toBe(false);
  expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, () => {})).toBe(
    true,
  );
});
it('explicit owner withdrawal permits a separate customer without erasing or resolving the old payment', async () => {
  const f = await rejectedRefresh();
  await f.controller.continueForAnotherCustomer();
  expect(f.controller.needsPaymentAttention).toBe(false);
  expect(() => guestBasket(f)).not.toThrow();
  const restarted = new SessionController(f.context, f.client, f.repository);
  await restarted.initialize();
  expect(restarted.needsPaymentAttention).toBe(false);
  expect(await f.repository.payments.load(f.context, f.principal, () => {})).toEqual(f.record);
});
it('holds an unresolved online submission even before an accepted payment record exists', async () => {
  const f = await paymentFixture(true);
  await f.store.remove(secretKey(f.context, 'payment', f.principal));
  await f.store.set(
    secretKey(f.context, 'order-operation-proof', f.principal),
    JSON.stringify(f.record.proof),
  );
  const controller = new SessionController(f.context, f.client, f.repository);
  await controller.initialize();
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(controller.orders.payment(f.record, 'en')).rejects.toThrow();
  // The read requires a persisted payment record; a regular authenticated read exercises withdrawal.
  await expect(controller.get(session.userId, '/api/User/profile', z.unknown())).rejects.toThrow();
  expect(controller.needsPaymentAttention).toBe(true);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it.each(['paid', 'expired', 'failed'] as const)(
  'does not create a continuity hold for canonical %s',
  async (state) => {
    const f = await paymentFixture(true);
    await f.repository.payments.resolve(f.context, f.record, paymentDecision(state), () => {});
    const controller = new SessionController(f.context, f.client, f.repository);
    await controller.initialize();
    f.fetcher.mockResolvedValue(response({}, 401));
    await expect(
      controller.get(session.userId, '/api/User/profile', z.unknown()),
    ).rejects.toThrow();
    expect(controller.needsPaymentAttention).toBe(false);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  },
);
it.each(['reminder-save', 'reminder-ack', 'credential-remove'] as const)(
  'credential cleanup retry preserves automatic withdrawal after %s failure',
  async (failure) => {
    const f = await paymentFixture(true);
    const controller = new SessionController(f.context, f.client, f.repository);
    await controller.initialize();
    const set = f.store.set;
    const remove = f.store.remove;
    const save = jest.spyOn(f.store, 'set').mockImplementation(async (key, value) => {
      if (key.endsWith('.payment-attention')) {
        if (failure === 'reminder-save') throw new Error('Locked');
        if (failure === 'reminder-ack') return;
      }
      await set(key, value);
    });
    const removal = jest.spyOn(f.store, 'remove').mockImplementation(async (key) => {
      if (failure === 'credential-remove' && key === secretKey(f.context, 'session', f.principal))
        throw new Error('Locked');
      await remove(key);
    });
    f.fetcher.mockResolvedValue(response({}, 401));
    await expect(controller.orders.payment(f.record, 'en')).rejects.toThrow();
    expect(controller.needsCleanup).toBe(true);
    expect(() => controller.captureRequestOwner({ kind: 'guest', id: 'basket' })).toThrow();
    save.mockRestore();
    removal.mockRestore();
    // This is the existing Account / Basket / Orders cleanup Retry action, without confirmation.
    await controller.logout();
    expect(controller.needsCleanup).toBe(false);
    expect(controller.needsPaymentAttention).toBe(true);
    expect(() => controller.captureRequestOwner({ kind: 'guest', id: 'basket' })).toThrow();
    const restarted = new SessionController(f.context, f.client, f.repository);
    await restarted.initialize();
    expect(restarted.needsPaymentAttention).toBe(true);
    expect(await f.repository.payments.load(f.context, f.principal, () => {})).toEqual(f.record);
    expect(await f.repository.load(f.context)).toBeNull();
  },
);
