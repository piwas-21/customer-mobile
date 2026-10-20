import { OrderReceiptController } from './orderReceiptController';
import { CustomerOrderController } from './customerOrderController';
import { SessionController } from './sessionController';
import { paymentFixture, paymentDecision } from '../test/customerPayment';
import { currentBasketOwner, basketOperationId } from '../test/basketOperations';
import { session } from '../test/sessions';
async function fixture() {
  const f = await paymentFixture(true);
  const sessions = new SessionController(f.context, f.client, f.repository, false);
  await sessions.initialize();
  const receipts = new OrderReceiptController(f.context, f.repository, sessions, f.principal);
  const orders = new CustomerOrderController(
    f.context,
    f.client,
    f.repository,
    sessions,
    f.principal,
    () => basketOperationId,
  );
  return { ...f, sessions, receipts, orders };
}
it('account-disabled recovery cannot leave a pending payment through either continuation path', async () => {
  const f = await fixture();
  expect(f.sessions.onlyRecoverOrders).toBe(true);
  expect(await f.orders.pending()).toBeNull();
  expect(await f.orders.hasUnresolvedPurchase()).toBe(true);
  expect((await f.receipts.list()).canContinueAsGuest).toBe(false);
  await expect(f.receipts.continueAsGuest()).rejects.toMatchObject({ status: 409 });
  expect(f.sessions.userId).toBe(session.userId);
  expect(await f.repository.load(f.context)).toEqual(session);
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each(['paid', 'expired', 'failed'] as const)(
  'canonical %s permits continuation without cancelling fulfillment',
  async (state) => {
    const f = await fixture();
    await f.repository.payments.resolve(
      f.context,
      f.record,
      paymentDecision(state),
      currentBasketOwner,
    );
    expect(await f.orders.hasUnresolvedPurchase()).toBe(false);
    expect((await f.receipts.list()).canContinueAsGuest).toBe(true);
    await f.receipts.continueAsGuest();
    expect(f.sessions.userId).toBeNull();
    expect(
      await f.repository.payments.load(f.context, f.principal, currentBasketOwner),
    ).toMatchObject({ state });
  },
);
