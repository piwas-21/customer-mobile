import { saveAcknowledgedSecret, removeAcknowledgedSecret } from './acknowledgedSecret';
import { scopedOrderDecisions, type OrderDecision } from './orderDecisions';
import { checkoutIntentSchema, type CheckoutIntent } from '../api/checkoutIntent';
import { secretKey, type Principal, type SecretStore } from './credentials';
import {
  assertOrderProofScope,
  orderOperationProofSchema,
  type OrderOperationProof,
} from './orderOperationProof';
import type { TenantContext } from './tenantContext';
import { z } from 'zod';
import { canonicalUuidSchema } from './identifiers';
const contactRecord = z.strictObject({
  operationId: canonicalUuidSchema,
  intent: checkoutIntentSchema,
});
export class OrderOperationStorage {
  constructor(private readonly store: SecretStore) {}
  check(context: TenantContext, assertCurrent: () => void) {
    if (context.signal.aborted) throw new Error('Restaurant changed');
    assertCurrent();
  }
  async ensureBasketUnclaimed(
    context: TenantContext,
    principal: Principal,
    assertCurrent: () => void,
  ) {
    const pending = await this.store.get(secretKey(context, 'basket-operation', principal));
    this.check(context, assertCurrent);
    if (pending !== null)
      throw new Error('Resolve the pending basket change before placing an order');
  }
  async read(
    context: TenantContext,
    principal: Principal,
    assertCurrent: () => void,
  ): Promise<OrderOperationProof | null> {
    this.check(context, assertCurrent);
    const value = await this.store.get(secretKey(context, 'order-operation-proof', principal));
    this.check(context, assertCurrent);
    if (value === null) return null;
    const proof = orderOperationProofSchema.parse(JSON.parse(value));
    assertOrderProofScope(context, proof);
    if (proof.principal.kind !== principal.kind || proof.principal.id !== principal.id)
      throw new Error('Order owner changed');
    return proof;
  }
  async intent(
    context: TenantContext,
    proof: OrderOperationProof,
    assertCurrent: () => void,
  ): Promise<CheckoutIntent | null> {
    const value = await this.store.get(secretKey(context, 'order-contact', proof.principal));
    this.check(context, assertCurrent);
    if (value === null) return null; // Logout removes contact without erasing the financial decision proof.
    const record = contactRecord.parse(JSON.parse(value));
    if (record.operationId !== proof.operationId) throw new Error('Order contact scope changed');
    return record.intent;
  }
  async save(
    context: TenantContext,
    principal: Principal,
    kind: 'order-operation-proof' | 'order-contact' | 'order-decisions',
    value: unknown,
    assertCurrent: () => void,
  ) {
    this.check(context, assertCurrent);
    const key = secretKey(context, kind, principal);
    const wire = JSON.stringify(value);
    await saveAcknowledgedSecret(this.store, key, wire);
    this.check(context, assertCurrent);
  }
  async decisions(
    context: TenantContext,
    principal: Principal,
    assertCurrent: () => void,
  ): Promise<OrderDecision[]> {
    const value = await this.store.get(secretKey(context, 'order-decisions', principal));
    this.check(context, assertCurrent);
    if (value === null) return [];
    return scopedOrderDecisions(context, principal, JSON.parse(value));
  }
  async removeProof(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    this.check(context, assertCurrent);
    const key = secretKey(context, 'order-operation-proof', principal);
    await removeAcknowledgedSecret(this.store, key);
    this.check(context, assertCurrent);
  }
  async removeContact(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    this.check(context, assertCurrent);
    const key = secretKey(context, 'order-contact', principal);
    await removeAcknowledgedSecret(this.store, key);
    this.check(context, assertCurrent);
  }
}
