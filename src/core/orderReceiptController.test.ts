import { OrderReceiptController } from './orderReceiptController';
import { savedOrderFixture, receiptResponse } from '../test/orderReceipt';
import { response } from '../test/transport';
import { currentBasketOwner, basketOperationId } from '../test/basketOperations';
import { checkoutIntent } from '../test/customerOrder';
import { deferred } from '../test/deferred';
import { SessionController } from './sessionController';
import { session } from '../test/sessions';
function controller(f: Awaited<ReturnType<typeof savedOrderFixture>>, sessions = f.sessions) {
  return new OrderReceiptController(f.context, f.repository, sessions, f.principal);
}
it('lists minimal local descriptors and reads only the selected owned accepted proof', async () => {
  const f = await savedOrderFixture();
  const reader = controller(f);
  const list = await reader.list();
  expect(list.items).toHaveLength(1);
  expect(JSON.stringify(list)).not.toMatch(/payloadHash|sessionId|native@example/);
  expect(f.fetcher).not.toHaveBeenCalled();
  f.fetcher.mockResolvedValue(response({ success: true, data: receiptResponse() }));
  expect((await reader.read(basketOperationId, 'en')).paymentStatus).toBe('Pending');
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  await reader.forget(basketOperationId);
  expect((await reader.list()).items).toEqual([]);
  await expect(reader.read(basketOperationId, 'en')).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('cannot remove the saved decision while its pending cleanup proof remains', async () => {
  const f = await savedOrderFixture();
  await f.repository.vault.saveCapability(
    f.context,
    'guest-session',
    f.principal,
    f.decision.sessionId,
  );
  await f.repository.orders.prepare(
    f.context,
    f.principal,
    { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) },
    () => basketOperationId,
    currentBasketOwner,
  );
  await expect(controller(f).forget(basketOperationId)).rejects.toMatchObject({ status: 409 });
  expect((await controller(f).list()).items).toHaveLength(1);
});
it('withdraws late receipts and all actions after owner logout or disposal', async () => {
  const f = await savedOrderFixture(true);
  const reader = controller(f);
  const reply = deferred<Response>();
  f.fetcher.mockReturnValue(reply.promise);
  const pending = reader.read(basketOperationId, 'en');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await f.sessions.logout();
  reply.resolve(response({ success: true, data: receiptResponse() }));
  await expect(pending).rejects.toThrow();
  await expect(reader.list()).rejects.toThrow();
  await expect(reader.forget(basketOperationId)).rejects.toThrow();
  reader.dispose();
  await expect(reader.continueAsGuest()).rejects.toThrow();
});
it('restores accepted customer receipts when accounts are disabled and allows explicit guest exit', async () => {
  const f = await savedOrderFixture(true);
  const sessions = new SessionController(f.context, f.client, f.repository, false);
  await sessions.initialize();
  expect(sessions.userId).toBe(session.userId);
  const reader = controller(f, sessions);
  expect((await reader.list()).canContinueAsGuest).toBe(true);
  await reader.continueAsGuest();
  expect(sessions.userId).toBeNull();
  expect(await f.repository.loadForOrderRecovery(f.context)).toBeNull();
  expect(await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner)).toEqual(
    [],
  );
});
it('does not permit a normal customer session to use the recovery-only exit', async () => {
  const f = await savedOrderFixture(true);
  await expect(controller(f).continueAsGuest()).rejects.toMatchObject({ status: 409 });
  expect(f.sessions.userId).toBe(session.userId);
});
