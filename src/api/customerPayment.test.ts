import { z } from 'zod';
import { recoverCustomerPayment } from './customerPayment';
import { customerPaymentDecisionSchema } from './customerPaymentDecision';
import { paymentFixture, paymentDecision } from '../test/customerPayment';
import { currentBasketOwner } from '../test/basketOperations';
import { secretKey } from '../core/credentials';
import { response } from '../test/transport';
import { tenantA, tenantB, directoryInput } from '../test/fixtures';
import { session } from '../test/sessions';
import { TenantBoundary } from '../core/tenantContext';
import { parseDirectory } from '../core/directory';
import { CustomerTransport } from '../core/transport';
it.each([false, true])(
  'requires original persisted payment proof before dispatch, customer=%s',
  async (customer) => {
    const f = await paymentFixture(customer);
    await f.repository.vault.saveCapability(f.context, 'guest-session', f.principal, tenantB);
    f.fetcher.mockResolvedValue(response({ success: true, data: paymentDecision('ready') }));
    await expect(
      recoverCustomerPayment(f.client, f.context, f.record, currentBasketOwner, 'fr'),
    ).resolves.toEqual(paymentDecision('ready'));
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(new URL(url).pathname).toBe('/api/customer-mobile/checkout/payment/recover');
    expect(options.headers?.['X-Session-Id']).toBe(f.pending.sessionId);
    expect(options.headers?.Authorization).toBe(
      customer ? `Bearer ${session.accessToken}` : undefined,
    );
    expect(JSON.parse(options.body!)).toEqual({
      schemaVersion: 1,
      operationId: f.pending.operationId,
      payloadHash: f.pending.payloadHash,
    });
  },
);
it.each(['missing', 'hash', 'session', 'owner', 'order', 'no-jwt'])(
  'refuses missing or substituted %s authority before HTTP',
  async (scenario) => {
    const f = await paymentFixture(scenario === 'no-jwt');
    if (scenario === 'missing') await f.store.remove(secretKey(f.context, 'payment', f.principal));
    if (scenario === 'no-jwt') await f.repository.vault.removeSession(f.context, f.principal.id);
    const record = {
      ...f.record,
      proof: {
        ...f.record.proof,
        ...(scenario === 'hash'
          ? { payloadHash: 'e'.repeat(64) }
          : scenario === 'session'
            ? { sessionId: tenantB }
            : scenario === 'owner'
              ? { principal: { kind: 'guest' as const, id: 'other' } }
              : {}),
      },
      ...(scenario === 'order' ? { orderId: tenantA } : {}),
    };
    expect(f.record.orderId).not.toBe(tenantA);
    await expect(
      recoverCustomerPayment(f.client, f.context, record, currentBasketOwner, 'en'),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it('readonly recovery is restricted to its exact POST route and requires a current owner guard', async () => {
  const f = await paymentFixture();
  const raw = directoryInput();
  raw.tenants[0]!.status = 'read-only';
  const boundary = new TenantBoundary(parseDirectory(raw, 'staging'));
  const context = boundary.select(tenantA);
  const client = new CustomerTransport(boundary, f.repository.vault, f.fetcher);
  f.fetcher.mockResolvedValue(response({ success: true, data: paymentDecision('pending') }));
  await expect(
    recoverCustomerPayment(client, context, f.record, currentBasketOwner, 'en'),
  ).resolves.toEqual(paymentDecision('pending'));
  for (const path of ['/api/orders', '/api/customer-mobile/orders/receipt']) {
    await expect(
      client.request(context, path, z.unknown(), {
        method: 'POST',
        credentials: 'order-payment',
        principal: f.principal,
        expectedOrderProof: f.record.proof,
        expectedPaymentOrderId: f.record.orderId,
        assertCurrent: currentBasketOwner,
      }),
    ).rejects.toThrow();
  }
  await expect(
    client.request(context, '/api/customer-mobile/checkout/payment/recover', z.unknown(), {
      method: 'POST',
      credentials: 'order-payment',
      principal: f.principal,
      expectedOrderProof: f.record.proof,
      expectedPaymentOrderId: f.record.orderId,
    }),
  ).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(['operation', 'order', 'future', 'extra', 'ready-null'])(
  'refuses a contradictory or unsupported %s server response',
  async (scenario) => {
    const f = await paymentFixture();
    const result = {
      ...paymentDecision('paid'),
      ...(scenario === 'operation'
        ? { operationId: tenantB }
        : scenario === 'order'
          ? { orderId: tenantA }
          : scenario === 'future'
            ? { outcome: 'future-state' }
            : scenario === 'extra'
              ? { providerReference: 'private-reference' }
              : { outcome: 'ready', checkoutUrl: null }),
    };
    f.fetcher.mockResolvedValue(response({ success: true, data: result }));
    await expect(
      recoverCustomerPayment(f.client, f.context, f.record, currentBasketOwner, 'en'),
    ).rejects.toThrow();
    expect(
      (await f.repository.payments.load(f.context, f.principal, currentBasketOwner))?.state,
    ).toBe('pending');
  },
);
it('keeps an expired local deadline pending and refuses changed frozen expiry', async () => {
  const f = await paymentFixture();
  const record = await f.repository.payments.resolve(
    f.context,
    f.record,
    paymentDecision('pending'),
    currentBasketOwner,
  );
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: { ...paymentDecision('paid'), expiresAt: '2026-10-21T12:00:00Z' },
    }),
  );
  await expect(
    recoverCustomerPayment(f.client, f.context, record, currentBasketOwner, 'en'),
  ).rejects.toThrow();
  expect(
    customerPaymentDecisionSchema.safeParse({
      ...paymentDecision('pending'),
      checkoutUrl: 'https://checkout.example.test',
    }).success,
  ).toBe(false);
});
