import {
  customerPaymentDecisionSchema,
  type CustomerPaymentDecision,
} from '../api/customerPaymentDecision';
import { secretKey, type Principal, type SecretStore } from './credentials';
import { orderOperationProofSchema, type OrderOperationProof } from './orderOperationProof';
import { scopedPaymentRecord, type PaymentOperationRecord } from './paymentOperationRecord';
import type { TenantContext } from './tenantContext';
// All calls run inside SessionRepository's shared secure queue. No network I/O holds that queue.
export class PaymentOperationStorage {
  constructor(private readonly store: SecretStore) {}
  async read(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    this.check(context, assertCurrent);
    const raw = await this.store.get(secretKey(context, 'payment', principal));
    this.check(context, assertCurrent);
    return raw === null ? null : scopedPaymentRecord(context, principal, JSON.parse(raw));
  }
  async assertResolved(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    if ((await this.read(context, principal, assertCurrent))?.state === 'pending')
      throw new Error('Resolve the original payment before starting another purchase');
  }
  async accept(
    context: TenantContext,
    proof: OrderOperationProof,
    orderId: string,
    assertCurrent: () => void,
  ) {
    const captured = orderOperationProofSchema.parse(proof);
    const previous = await this.read(context, captured.principal, assertCurrent);
    const next = scopedPaymentRecord(context, captured.principal, {
      schemaVersion: 1,
      proof: captured,
      orderId,
      state: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: null,
    });
    if (previous?.proof.operationId === captured.operationId) {
      if (
        previous.orderId !== orderId ||
        JSON.stringify(previous.proof) !== JSON.stringify(captured)
      )
        throw new Error('Original payment identity changed');
      return previous;
    }
    if (previous?.state === 'pending') throw new Error('Resolve the original payment first');
    await this.save(context, next, assertCurrent);
    return next;
  }
  async resolve(
    context: TenantContext,
    expected: PaymentOperationRecord,
    response: CustomerPaymentDecision,
    assertCurrent: () => void,
  ) {
    const captured = scopedPaymentRecord(context, expected.proof.principal, expected);
    const decision = customerPaymentDecisionSchema.parse(response);
    const current = await this.read(context, captured.proof.principal, assertCurrent);
    if (
      current === null ||
      JSON.stringify(current) !== JSON.stringify(captured) ||
      decision.orderId !== current.orderId ||
      decision.operationId !== current.proof.operationId ||
      (current.expiresAt !== null && current.expiresAt !== decision.expiresAt)
    )
      throw new Error('Original payment decision changed');
    const state = decision.outcome === 'ready' ? 'pending' : decision.outcome;
    if (current.state !== 'pending' && state !== current.state)
      throw new Error('Conflicting terminal payment decision');
    const next: PaymentOperationRecord = { ...current, state, expiresAt: decision.expiresAt };
    await this.save(context, next, assertCurrent);
    return next;
  }
  private async save(
    context: TenantContext,
    record: PaymentOperationRecord,
    assertCurrent: () => void,
  ) {
    this.check(context, assertCurrent);
    const key = secretKey(context, 'payment', record.proof.principal);
    const wire = JSON.stringify(record);
    await this.store.set(key, wire);
    if ((await this.store.get(key)) !== wire) throw new Error('Secure payment save incomplete');
    this.check(context, assertCurrent);
  }
  private check(context: TenantContext, assertCurrent: () => void) {
    if (context.signal.aborted) throw new Error('Restaurant changed');
    assertCurrent();
  }
}
