import { savedOrderFixture } from '../test/orderReceipt';
import { SessionController } from './sessionController';
import { customerOrderFixture } from '../test/customerOrder';
import { secretKey } from './credentials';
import { session } from '../test/sessions';
it('loads a saved customer session for recovery only when its original pending proof is present', async () => {
  const f = await customerOrderFixture(true);
  const read = jest.spyOn(f.repository.vault, 'session');
  expect(await f.repository.loadForOrderRecovery(f.context)).toEqual(session);
  expect(read).toHaveBeenCalledTimes(1);
  read.mockClear();
  await f.store.remove(secretKey(f.context, 'order-operation-proof', f.principal));
  expect(await f.repository.loadForOrderRecovery(f.context)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});
it.each(['environment', 'tenantId', 'principal'] as const)(
  'rejects a substituted %s in a saved recovery proof before reading a JWT',
  async (field) => {
    const f = await customerOrderFixture(true);
    const key = secretKey(f.context, 'order-operation-proof', f.principal);
    const value =
      field === 'principal'
        ? { kind: 'guest', id: 'basket' }
        : field === 'environment'
          ? 'production'
          : '22222222-2222-4222-8222-222222222222';
    await f.store.set(key, JSON.stringify({ ...f.pending, intent: undefined, [field]: value }));
    const read = jest.spyOn(f.repository.vault, 'session');
    await expect(f.repository.loadForOrderRecovery(f.context)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  },
);

it('logout of an accounts-disabled recovered customer clears the original credentials/contact before restart', async () => {
  const f = await customerOrderFixture(true);
  const controller = new SessionController(f.context, f.client, f.repository, false);
  await controller.initialize();
  expect(controller.userId).toBe(session.userId);
  expect(controller.onlyRecoverOrders).toBe(true);
  await controller.logout();
  expect(controller.userId).toBeNull();
  expect(await f.repository.vault.session(f.context, session.userId)).toBeNull();
  expect(await f.store.get(secretKey(f.context, 'order-contact', f.principal))).toBeNull();
  expect(
    await f.store.get(secretKey(f.context, 'order-operation-proof', f.principal)),
  ).not.toBeNull();
  const restarted = new SessionController(f.context, f.client, f.repository, false);
  await restarted.initialize();
  expect(restarted.userId).toBeNull();
  expect(await f.repository.loadForOrderRecovery(f.context)).toBeNull();
});

it.each(['environment', 'tenantId', 'principal'] as const)(
  'rejects substituted %s in accepted receipt history before reading a JWT',
  async (field) => {
    const f = await savedOrderFixture(true);
    const key = secretKey(f.context, 'order-decisions', f.principal);
    const value =
      field === 'principal'
        ? { kind: 'guest', id: 'basket' }
        : field === 'environment'
          ? 'production'
          : '22222222-2222-4222-8222-222222222222';
    await f.store.set(key, JSON.stringify([{ ...f.decision, [field]: value }]));
    const read = jest.spyOn(f.repository.vault, 'session');
    await expect(f.repository.loadForOrderRecovery(f.context)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  },
);
it('does not read a JWT for cancelled-only local history', async () => {
  const f = await savedOrderFixture(true);
  await f.store.set(
    secretKey(f.context, 'order-decisions', f.principal),
    JSON.stringify([{ ...f.decision, outcome: 'Cancelled', orderId: null }]),
  );
  const read = jest.spyOn(f.repository.vault, 'session');
  expect(await f.repository.loadForOrderRecovery(f.context)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});
