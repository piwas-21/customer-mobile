import { appliedOrder, checkoutIntent } from '../test/customerOrder';
import { basketInput, basketOperationId, currentBasketOwner } from '../test/basketOperations';
import { session } from '../test/sessions';
import { tenantA, tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
import { SessionRepository } from './sessionRepository';
import type { CustomerPaymentDecision } from '../api/customerPaymentDecision';
import {
  paymentFixture as acceptedOnline,
  paymentDecision as decision,
} from '../test/customerPayment';
it('acceptance durably retains only the original payment proof before releasing the order claim, including after restart/logout', async () => {
  const f = await acceptedOnline(true);
  expect(f.pending.onlinePayment).toBe(true);
  const stored = await f.store.get(secretKey(f.context, 'payment', f.principal));
  expect(stored).not.toContain('native@example.test');
  expect(stored).not.toContain(session.accessToken);
  expect(stored).not.toContain('checkoutUrl');
  expect(f.record.proof.sessionId).toBe(f.pending.sessionId);
  expect(f.record.orderId).toBe(appliedOrder().orderId);
  await f.sessions.logout();
  expect(await f.repository.vault.session(f.context, session.userId)).toBeNull();
  const restored = new SessionRepository(f.store);
  expect(await restored.payments.load(f.context, f.principal, currentBasketOwner)).toEqual(
    f.record,
  );
  expect(await restored.orders.load(f.context, f.principal, currentBasketOwner)).toBeNull();
});
it('unresolved payments block competing order/basket claims and forgetting the original receipt', async () => {
  const f = await acceptedOnline();
  await expect(
    f.repository.orders.prepare(
      f.context,
      f.principal,
      { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
      () => tenantB,
      currentBasketOwner,
    ),
  ).rejects.toThrow('original payment');
  await expect(
    f.repository.baskets.prepare(
      f.context,
      f.principal,
      basketInput,
      () => tenantB,
      currentBasketOwner,
    ),
  ).rejects.toThrow('original payment');
  await expect(
    f.repository.orders.forgetDecision(
      f.context,
      f.principal,
      basketOperationId,
      currentBasketOwner,
    ),
  ).rejects.toThrow('original payment');
});
it.each(['ready', 'pending'] as const)(
  'only canonical terminal evidence releases a %s attempt, never local expiry or browser closure',
  async (outcome) => {
    const f = await acceptedOnline();
    const saved = await f.repository.payments.resolve(
      f.context,
      f.record,
      decision(outcome),
      currentBasketOwner,
    );
    expect(saved.state).toBe('pending');
    expect(saved.expiresAt).toBe('2026-10-20T12:00:00Z');
    expect(JSON.stringify(saved)).not.toContain('https://checkout');
    await expect(
      f.repository.baskets.prepare(
        f.context,
        f.principal,
        basketInput,
        () => tenantB,
        currentBasketOwner,
      ),
    ).rejects.toThrow('original payment');
  },
);
it.each(['paid', 'expired', 'failed'] as const)(
  'persists the explicit %s result before allowing another purchase',
  async (outcome) => {
    const f = await acceptedOnline();
    const saved = await f.repository.payments.resolve(
      f.context,
      f.record,
      decision(outcome),
      currentBasketOwner,
    );
    expect(saved.state).toBe(outcome);
    expect(
      (await f.repository.orders.decisions(f.context, f.principal, currentBasketOwner))[0]?.outcome,
    ).toBe('Applied');
    await expect(
      f.repository.orders.prepare(
        f.context,
        f.principal,
        { intent: checkoutIntent(), payloadHash: 'd'.repeat(64) },
        () => tenantB,
        currentBasketOwner,
      ),
    ).resolves.toBeDefined();
  },
);
it.each(['operation', 'order', 'expiry', 'future', 'paid-url'])(
  'holds the original record on a contradictory or unsupported %s decision',
  async (scenario) => {
    const f = await acceptedOnline();
    const first = await f.repository.payments.resolve(
      f.context,
      f.record,
      decision('pending'),
      currentBasketOwner,
    );
    const response = {
      ...decision('paid'),
      ...(scenario === 'operation'
        ? { operationId: tenantB }
        : scenario === 'order'
          ? { orderId: tenantA }
          : scenario === 'expiry'
            ? { expiresAt: '2026-10-21T12:00:00Z' }
            : scenario === 'future'
              ? { outcome: 'future-status' }
              : { checkoutUrl: 'https://checkout.example.test' }),
    };
    await expect(async () =>
      f.repository.payments.resolve(
        f.context,
        first,
        response as CustomerPaymentDecision,
        currentBasketOwner,
      ),
    ).rejects.toThrow();
    expect(await f.repository.payments.load(f.context, f.principal, currentBasketOwner)).toEqual(
      first,
    );
  },
);
it('serializes outcome publication and refuses a stale pending response after canonical payment', async () => {
  const f = await acceptedOnline();
  const results = await Promise.allSettled([
    f.repository.payments.resolve(f.context, f.record, decision('paid'), currentBasketOwner),
    f.repository.payments.resolve(f.context, f.record, decision('pending'), currentBasketOwner),
  ]);
  expect(results.map((value) => value.status)).toEqual(['fulfilled', 'rejected']);
  expect(
    (await f.repository.payments.load(f.context, f.principal, currentBasketOwner))?.state,
  ).toBe('paid');
});
