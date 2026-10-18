import { z } from 'zod';
import type { TenantContext } from './tenantContext';
const operationSchema = z
  .object({
    environment: z.enum(['staging', 'production']),
    tenantId: z.string().uuid(),
    operationId: z.string().uuid(),
    orderId: z.string().uuid(),
    sessionId: z.string().min(1),
    state: z.enum(['pending', 'confirmed', 'cancelled']),
    createdAt: z.string().datetime(),
  })
  .strict();
export type PendingPayment = z.infer<typeof operationSchema>;
export function readPendingPayment(value: unknown): PendingPayment {
  return operationSchema.parse(value);
}
export function assertPaymentContext(context: TenantContext, payment: PendingPayment): void {
  if (context.environment !== payment.environment || context.tenant.id !== payment.tenantId) {
    throw new Error('Restore the original restaurant before reconciling payment');
  }
}
export function reconcilePayment(
  payment: PendingPayment,
  status: { paymentStatus: string; orderStatus: string },
): PendingPayment {
  if (payment.state === 'confirmed') return payment;
  if (status.paymentStatus === 'Completed') return { ...payment, state: 'confirmed' };
  // Cancellation of navigation or an order does not establish the provider's settlement outcome.
  return { ...payment, state: 'pending' };
}
export function mayStartPayment(payment: PendingPayment | null): boolean {
  return payment === null;
}
