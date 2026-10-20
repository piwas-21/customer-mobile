import { checkoutQuoteFixture } from '../test/checkoutQuote';
import { appliedOrder, checkoutIntent } from '../test/customerOrder';
import { paymentFixture, paymentDecision } from '../test/customerPayment';
import { basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
async function prepareOnline() {
  const f = await checkoutQuoteFixture();
  const { intent: _intent, ...proof } = await f.repository.orders.prepare(
    f.context,
    f.principal,
    {
      intent: { ...checkoutIntent(), paymentMethod: 'OnlinePayment' },
      payloadHash: 'c'.repeat(64),
    },
    () => basketOperationId,
    currentBasketOwner,
  );
  return { ...f, proof };
}
it.each(['Cash', 'CreditCard'] as const)(
  'an accepted %s order does not create an online payment claim',
  async (paymentMethod) => {
    const f = await checkoutQuoteFixture();
    await f.repository.orders.prepare(
      f.context,
      f.principal,
      { intent: { ...checkoutIntent(), paymentMethod }, payloadHash: 'c'.repeat(64) },
      () => basketOperationId,
      currentBasketOwner,
    );
    await f.repository.orders.finish(f.context, f.principal, appliedOrder(), currentBasketOwner);
    expect(await f.repository.payments.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  },
);
it('cancellation before acceptance creates no payment claim, while a late Applied decision retains original financial recovery', async () => {
  const f = await prepareOnline();
  await f.repository.orders.requestCancellation(
    f.context,
    f.principal,
    basketOperationId,
    currentBasketOwner,
  );
  await f.repository.orders.finish(
    f.context,
    f.principal,
    { ...appliedOrder(), outcome: 'Cancelled', orderId: null },
    currentBasketOwner,
  );
  expect(await f.repository.payments.load(f.context, f.principal, currentBasketOwner)).toBeNull();
  const next = await prepareOnline();
  await next.repository.orders.requestCancellation(
    next.context,
    next.principal,
    basketOperationId,
    currentBasketOwner,
  );
  await next.repository.orders.finish(
    next.context,
    next.principal,
    appliedOrder(),
    currentBasketOwner,
  );
  expect(
    (await next.repository.payments.load(next.context, next.principal, currentBasketOwner))?.proof
      .cancellationRequested,
  ).toBe(true);
});
it('a payment saved before failed receipt persistence survives restart and acceptance replay does not reset a paid outcome', async () => {
  const f = await prepareOnline();
  const write = f.store.set.bind(f.store);
  const key = secretKey(f.context, 'order-decisions', f.principal);
  jest
    .spyOn(f.store, 'set')
    .mockImplementation((name, value) =>
      name === key ? Promise.reject(new Error('receipt store failed')) : write(name, value),
    );
  await expect(
    f.repository.orders.finish(f.context, f.principal, appliedOrder(), currentBasketOwner),
  ).rejects.toThrow('receipt store failed');
  const restarted = new SessionRepository(f.store);
  const saved = (await restarted.payments.load(f.context, f.principal, currentBasketOwner))!;
  expect(saved.proof.operationId).toBe(basketOperationId);
  expect((await restarted.orders.load(f.context, f.principal, currentBasketOwner))?.proof).toEqual(
    f.proof,
  );
  await restarted.payments.resolve(f.context, saved, paymentDecision('paid'), currentBasketOwner);
  jest.restoreAllMocks();
  await restarted.orders.finish(f.context, f.principal, appliedOrder(), currentBasketOwner);
  expect((await restarted.payments.load(f.context, f.principal, currentBasketOwner))?.state).toBe(
    'paid',
  );
  expect(await restarted.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
it('failed payment acknowledgement leaves the order proof and durable payment blocking replacement', async () => {
  const f = await prepareOnline();
  const key = secretKey(f.context, 'payment', f.principal);
  const read = f.store.get.bind(f.store);
  const write = f.store.set.bind(f.store);
  let fail = false;
  jest.spyOn(f.store, 'set').mockImplementation(async (name, value) => {
    await write(name, value);
    if (name === key) fail = true;
  });
  jest.spyOn(f.store, 'get').mockImplementation(async (name) => {
    if (name === key && fail) {
      fail = false;
      throw new Error('payment ack lost');
    }
    return read(name);
  });
  await expect(
    f.repository.orders.finish(f.context, f.principal, appliedOrder(), currentBasketOwner),
  ).rejects.toThrow('payment ack lost');
  const restarted = new SessionRepository(f.store);
  expect((await restarted.payments.load(f.context, f.principal, currentBasketOwner))?.state).toBe(
    'pending',
  );
  expect((await restarted.orders.load(f.context, f.principal, currentBasketOwner))?.proof).toEqual(
    f.proof,
  );
  await expect(
    restarted.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
      () => tenantB,
      currentBasketOwner,
    ),
  ).rejects.toThrow();
});
it('a queued response is captured before asynchronous storage can yield to caller mutation', async () => {
  const f = await paymentFixture();
  const response = paymentDecision('pending');
  const result = f.repository.payments.resolve(f.context, f.record, response, currentBasketOwner);
  response.outcome = 'paid';
  expect((await result).state).toBe('pending');
});
it('a context or owner withdrawn during publication cannot return a usable decision', async () => {
  const f = await paymentFixture();
  let active = true;
  const write = f.store.set.bind(f.store);
  jest.spyOn(f.store, 'set').mockImplementation(async (key, value) => {
    await write(key, value);
    active = false;
  });
  const guard = () => {
    if (!active) throw new Error('withdrawn owner');
  };
  await expect(
    f.repository.payments.resolve(f.context, f.record, paymentDecision('paid'), guard),
  ).rejects.toThrow('withdrawn owner');
  f.boundary.select(tenantB);
  await expect(
    f.repository.payments.load(f.context, f.principal, currentBasketOwner),
  ).rejects.toThrow();
});
it('storage cannot substitute another order under the same original operation', async () => {
  const f = await prepareOnline();
  await f.repository.orders.finish(f.context, f.principal, appliedOrder(), currentBasketOwner);
  const changedOrderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  expect(appliedOrder().orderId).not.toBe(changedOrderId);
  // Reinstall the retained order proof to exercise interrupted acceptance rather than minting an attempt.
  await f.store.set(
    secretKey(f.context, 'order-operation-proof', f.principal),
    JSON.stringify(f.proof),
  );
  await expect(
    f.repository.orders.finish(
      f.context,
      f.principal,
      { ...appliedOrder(), orderId: changedOrderId },
      currentBasketOwner,
    ),
  ).rejects.toThrow('identity changed');
  expect(
    (await f.repository.payments.load(f.context, f.principal, currentBasketOwner))?.orderId,
  ).toBe(appliedOrder().orderId);
});
