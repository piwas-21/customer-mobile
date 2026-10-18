import {
  assertPaymentContext,
  mayStartPayment,
  readPendingPayment,
  reconcilePayment,
} from './paymentRecovery';
import { TenantBoundary } from './tenantContext';
import { fixtureDirectory, tenantA, tenantB } from '../test/fixtures';
const pending = readPendingPayment({
  environment: 'staging',
  tenantId: tenantA,
  operationId: '33333333-3333-4333-8333-333333333333',
  orderId: '44444444-4444-4444-8444-444444444444',
  sessionId: 'opaque-session',
  state: 'pending',
  createdAt: '2026-10-18T12:00:00Z',
});
it('requires original restaurant and keeps unknown/future states pending', () => {
  const boundary = new TenantBoundary(fixtureDirectory());
  expect(() => assertPaymentContext(boundary.select(tenantA), pending)).not.toThrow();
  expect(() => assertPaymentContext(boundary.select(tenantB), pending)).toThrow();
  expect(
    reconcilePayment(pending, { paymentStatus: 'FutureProviderState', orderStatus: 'Cancelled' })
      .state,
  ).toBe('pending');
  expect(mayStartPayment(pending)).toBe(false);
  expect(mayStartPayment(null)).toBe(true);
  const confirmed = reconcilePayment(pending, {
    paymentStatus: 'Completed',
    orderStatus: 'Confirmed',
  });
  expect(confirmed.state).toBe('confirmed');
  expect(
    reconcilePayment(confirmed, { paymentStatus: 'Pending', orderStatus: 'Confirmed' }).state,
  ).toBe('confirmed');
});
