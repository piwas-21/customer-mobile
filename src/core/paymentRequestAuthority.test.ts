import { z } from 'zod';
import { deferred } from '../test/deferred';
import { paymentFixture, paymentDecision } from '../test/customerPayment';
import { response } from '../test/transport';
import { session } from '../test/sessions';
import { currentBasketOwner } from '../test/basketOperations';
import { tenantA, tenantB } from '../test/fixtures';
import { recoverCustomerPayment } from '../api/customerPayment';
import type { RequestOptions } from './httpTypes';
it('captures payment order, original proof and body before async JWT reads', async () => {
  const f = await paymentFixture(true);
  const entered = deferred<void>();
  const gate = deferred<void>();
  jest.spyOn(f.repository.vault, 'session').mockImplementation(async () => {
    entered.resolve();
    await gate.promise;
    return session;
  });
  const expectedProof = { ...f.record.proof };
  const options: RequestOptions = {
    method: 'POST',
    credentials: 'order-payment',
    expectedOrderProof: expectedProof,
    expectedPaymentOrderId: f.record.orderId,
    principal: { ...f.principal },
    assertCurrent: currentBasketOwner,
    body: { operationId: f.pending.operationId },
  };
  f.fetcher.mockResolvedValue(response({ success: true, data: 'original' }));
  const pending = f.client.request(
    f.context,
    '/api/customer-mobile/checkout/payment/recover',
    z.literal('original'),
    options,
  );
  await entered.promise;
  options.expectedPaymentOrderId = tenantA;
  expectedProof.payloadHash = 'e'.repeat(64);
  options.principal = { kind: 'customer', id: tenantB };
  options.body = { operationId: tenantB };
  gate.resolve();
  await expect(pending).resolves.toBe('original');
  expect(f.fetcher.mock.calls[0]![1].headers?.['X-Session-Id']).toBe(f.pending.sessionId);
  expect(JSON.parse(f.fetcher.mock.calls[0]![1].body!)).toEqual({
    operationId: f.pending.operationId,
  });
});
it.each(['owner', 'tenant'] as const)(
  'withdraws a late payment response after %s changes',
  async (change) => {
    const f = await paymentFixture();
    const entered = deferred<void>();
    const reply = deferred<Response>();
    let current = true;
    const guard = () => {
      if (!current) throw new Error('Owner changed');
    };
    f.fetcher.mockImplementation(async () => {
      entered.resolve();
      return reply.promise;
    });
    const pending = recoverCustomerPayment(f.client, f.context, f.record, guard, 'en');
    await entered.promise;
    if (change === 'owner') current = false;
    else f.boundary.select(tenantB);
    reply.resolve(response({ success: true, data: paymentDecision('paid') }));
    await expect(pending).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each(['guest', 'wrong-order', 'missing-guard', 'wrong-route', 'wrong-method'])(
  'payment renewal refuses %s before dispatch',
  async (change) => {
    const f = await paymentFixture(change !== 'guest');
    await expect(
      f.client.request(
        f.context,
        change === 'wrong-route' ? '/api/Auth/login' : '/api/Auth/refresh-token',
        z.unknown(),
        {
          method: change === 'wrong-method' ? 'GET' : 'POST',
          credentials: 'payment-renewal',
          principal: f.principal,
          expectedOrderProof: f.record.proof,
          expectedPaymentOrderId: change === 'wrong-order' ? tenantA : f.record.orderId,
          ...(change === 'missing-guard' ? {} : { assertCurrent: currentBasketOwner }),
        },
      ),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
