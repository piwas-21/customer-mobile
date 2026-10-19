import { readOrderReceipt, orderReceiptSchema } from './orderReceipt';
import { receiptResponse, savedOrderFixture } from '../test/orderReceipt';
import { response } from '../test/transport';
import { currentBasketOwner } from '../test/basketOperations';
import { tenantA, tenantB } from '../test/fixtures';
import { secretKey } from '../core/credentials';
import { session } from '../test/sessions';
import { deferred } from '../test/deferred';
import { decisionProof } from '../core/orderDecisions';
import { z } from 'zod';
it.each([false, true])(
  'reads an exact accepted receipt using its original scoped proof, customer=%s',
  async (customer) => {
    const f = await savedOrderFixture(customer);
    await f.repository.vault.saveCapability(f.context, 'guest-session', f.principal, tenantB);
    f.fetcher.mockResolvedValue(response({ success: true, data: receiptResponse() }));
    expect(
      await readOrderReceipt(f.client, f.context, f.decision, currentBasketOwner, 'fr'),
    ).toEqual(receiptResponse());
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe('/api/customer-mobile/orders/receipt');
    expect(options.headers?.['X-Session-Id']).toBe(f.pending.sessionId);
    expect(options.headers?.Authorization).toBe(
      customer ? `Bearer ${session.accessToken}` : undefined,
    );
    expect(JSON.parse(options.body!)).toEqual({
      schemaVersion: 1,
      operationId: f.pending.operationId,
      payloadHash: f.pending.payloadHash,
    });
    expect(options.body).not.toContain('native@example.test');
  },
);
it.each(['forgotten', 'cancelled', 'hash', 'scope', 'no-jwt'] as const)(
  'refuses %s saved proof before any HTTP request',
  async (mode) => {
    const f = await savedOrderFixture(mode === 'no-jwt');
    if (mode === 'forgotten')
      await f.repository.orders.forgetDecision(
        f.context,
        f.principal,
        f.decision.operationId,
        currentBasketOwner,
      );
    if (mode === 'cancelled')
      await f.store.set(
        secretKey(f.context, 'order-decisions', f.principal),
        JSON.stringify([{ ...f.decision, outcome: 'Cancelled', orderId: null }]),
      );
    if (mode === 'no-jwt') await f.repository.vault.removeSession(f.context, f.principal.id);
    const decision =
      mode === 'hash'
        ? { ...f.decision, payloadHash: 'f'.repeat(64) }
        : mode === 'scope'
          ? { ...f.decision, tenantId: tenantB }
          : f.decision;
    await expect(
      readOrderReceipt(f.client, f.context, decision, currentBasketOwner, 'en'),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('refuses a substituted order response and preserves future lifecycle/payment text without granting actions', async () => {
  const f = await savedOrderFixture();
  expect(f.decision.orderId).not.toBe(tenantA);
  f.fetcher.mockResolvedValue(
    response({ success: true, data: { ...receiptResponse(), orderId: tenantA } }),
  );
  await expect(
    readOrderReceipt(f.client, f.context, f.decision, currentBasketOwner, 'en'),
  ).rejects.toThrow('identity');
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: { ...receiptResponse(), status: 'FutureFulfillment', paymentStatus: 'FuturePayment' },
    }),
  );
  expect(
    (await readOrderReceipt(f.client, f.context, f.decision, currentBasketOwner, 'en')).status,
  ).toBe('FutureFulfillment');
});
it('withdraws the original owner before credential completion and never publishes a late receipt', async () => {
  const f = await savedOrderFixture(true);
  const credentials = deferred<typeof session>();
  jest.spyOn(f.repository.vault, 'session').mockReturnValue(credentials.promise);
  let current = true;
  const read = readOrderReceipt(
    f.client,
    f.context,
    f.decision,
    () => {
      if (!current) throw new Error('Owner changed');
    },
    'en',
  );
  current = false;
  credentials.resolve(session);
  await expect(read).rejects.toThrow('Owner changed');
  expect(f.fetcher).not.toHaveBeenCalled();
});
it('permits frozen lines after catalogue deletion while rejecting quote IDs, invalid timezone and unsafe recursive shape', () => {
  const receipt = receiptResponse();
  receipt.items[0]!.productId = null;
  expect(orderReceiptSchema.safeParse(receipt).success).toBe(true);
  expect(
    orderReceiptSchema.safeParse({ ...receipt, businessTimeZoneId: 'invalid-zone' }).success,
  ).toBe(false);
  receipt.items[0]!.basketItemId = tenantB;
  expect(orderReceiptSchema.safeParse(receipt).success).toBe(false);
});
it('the receipt credential mode cannot dispatch a different route or method', async () => {
  const f = await savedOrderFixture();
  for (const path of [
    '/api/customer-mobile/checkout/submit',
    '/api/customer-mobile/orders/receipt?extra=1',
  ])
    await expect(
      f.client.request(f.context, path, z.unknown(), {
        method: 'POST',
        credentials: 'order-receipt',
        principal: f.principal,
        expectedOrderProof: decisionProof(f.decision),
      }),
    ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
