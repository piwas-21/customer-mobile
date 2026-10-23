import { assertTablePurchasesResolved, tablePurchasesHeld } from './tablePurchaseHold';
import { orderDecisionSchema, savedOrderLimit } from './orderDecisions';
import type { CustomerOrderResolution } from '../api/customerOrderOperation';
import {
  checkoutIntentSchema,
  orderPayloadHashSchema,
  type CheckoutIntent,
} from '../api/checkoutIntent';
import { canonicalUuidSchema } from './identifiers';
import {
  principalSchema,
  type CredentialVault,
  type Principal,
  type SecretStore,
} from './credentials';
import { orderOperationProofSchema, type OrderOperationProof } from './orderOperationProof';
import { OrderOperationStorage } from './orderOperationStorage';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { PaymentOperationStorage } from './paymentOperationStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export class OrderOperationRepository {
  private readonly storage: OrderOperationStorage;
  private readonly payments: PaymentOperationStorage;
  constructor(
    private readonly store: SecretStore,
    private readonly vault: CredentialVault,
    private readonly tasks: SerialTasks,
  ) {
    this.storage = new OrderOperationStorage(store);
    this.payments = new PaymentOperationStorage(store);
  }
  prepare(
    context: TenantContext,
    principal: Principal,
    prepared: { intent: CheckoutIntent; payloadHash: string },
    createId: () => string,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    const intent = checkoutIntentSchema.parse(prepared.intent);
    const payloadHash = orderPayloadHashSchema.parse(prepared.payloadHash);
    return this.tasks.run(async () => {
      this.storage.check(context, assertCurrent);
      if (await this.storage.read(context, owner, assertCurrent))
        throw new Error('Resolve the pending order first');
      if ((await this.storage.decisions(context, owner, assertCurrent)).length >= savedOrderLimit)
        throw new Error('Manage saved order receipts before placing another order');
      await assertTablePurchasesResolved(this.store, context, owner, assertCurrent);
      await this.storage.ensureBasketUnclaimed(context, owner, assertCurrent);
      await this.payments.assertResolved(context, owner, assertCurrent);
      await new CancellationOperationStorage(this.store).assertResolved(
        context,
        owner,
        assertCurrent,
      );
      const sessionId = canonicalUuidSchema.parse(
        await this.vault.capability(context, 'guest-session', owner),
      );
      this.storage.check(context, assertCurrent);
      const proof = orderOperationProofSchema.parse({
        schemaVersion: 1,
        environment: context.environment,
        tenantId: context.tenant.id,
        principal: owner,
        sessionId,
        operationId: createId(),
        payloadHash,
        cancellationRequested: false,
        ...(intent.paymentMethod === 'OnlinePayment' ? { onlinePayment: true } : {}),
      });
      // Contact first, then the proof. Dispatch requires verified readback of both; a failed
      // acknowledgement cannot mint a replacement operation on the next attempt.
      await this.storage.save(
        context,
        owner,
        'order-contact',
        { operationId: proof.operationId, intent },
        assertCurrent,
      );
      await this.storage.save(context, owner, 'order-operation-proof', proof, assertCurrent);
      return { ...proof, intent };
    });
  }
  load(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(async () => {
      const proof = await this.storage.read(context, owner, assertCurrent);
      if (!proof) return null;
      const intent = await this.storage.intent(context, proof, assertCurrent);
      return { proof, intent };
    });
  }
  hasUnresolvedPurchase(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(
      async () =>
        Boolean(await this.storage.read(context, owner, assertCurrent)) ||
        (await tablePurchasesHeld(this.store, context, owner, assertCurrent)) ||
        (await this.payments.read(context, owner, assertCurrent))?.state === 'pending' ||
        (await new CancellationOperationStorage(this.store).read(context, owner, assertCurrent))
          ?.resolution === null,
    );
  }
  requestCancellation(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    canonicalUuidSchema.parse(operationId);
    return this.tasks.run(async () => {
      const proof = await this.storage.read(context, owner, assertCurrent);
      if (proof?.operationId !== operationId) throw new Error('Order operation changed');
      if (proof.cancellationRequested) return proof;
      const cancelling: OrderOperationProof = { ...proof, cancellationRequested: true };
      await this.storage.save(context, owner, 'order-operation-proof', cancelling, assertCurrent);
      // Even if cleanup fails after this point, a restart can only recover cancellation.
      await this.storage.removeContact(context, owner, assertCurrent);
      return cancelling;
    });
  }
  decisions(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(() => this.storage.decisions(context, owner, assertCurrent));
  }
  // Only a validated server outcome releases the pending identity. Save recovery history first;
  // failed cleanup is repeatable and cannot erase the only accepted-order reference.
  finish(
    context: TenantContext,
    principal: Principal,
    resolution: CustomerOrderResolution,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    const captured = { ...resolution };
    return this.tasks.run(async () => {
      const decisions = await this.storage.decisions(context, owner, assertCurrent);
      const previous = decisions.find((value) => value.operationId === captured.operationId);
      if (captured.outcome === 'Unseen')
        throw new Error('An unseen read cannot release a pending order');
      const proof = await this.storage.read(context, owner, assertCurrent);
      if (!proof) {
        if (previous?.outcome === captured.outcome && previous.orderId === captured.orderId) return;
        throw new Error('Order operation unavailable');
      }
      if (proof.operationId !== captured.operationId) throw new Error('Order operation changed');
      if (proof.onlinePayment && captured.outcome === 'Applied' && captured.orderId)
        await this.payments.accept(context, proof, captured.orderId, assertCurrent);
      const decision = orderDecisionSchema.parse({
        ...proof,
        outcome: captured.outcome,
        orderId: captured.orderId,
        recordedAt: new Date().toISOString(),
      });
      if (previous) {
        if (previous.outcome !== captured.outcome || previous.orderId !== captured.orderId)
          throw new Error('Conflicting order decision');
      } else {
        if (decisions.length >= savedOrderLimit)
          throw new Error('Saved order receipt storage is full');
        await this.storage.save(
          context,
          owner,
          'order-decisions',
          [...decisions, decision],
          assertCurrent,
        );
      }
      await this.storage.removeContact(context, owner, assertCurrent);
      await this.storage.removeProof(context, owner, assertCurrent);
    });
  }
  // A customer may explicitly forget a resolved local receipt. Pending operations cannot use this path.
  forgetDecision(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    canonicalUuidSchema.parse(operationId);
    return this.tasks.run(async () => {
      const payment = await this.payments.read(context, owner, assertCurrent);
      if (payment?.state === 'pending' && payment.proof.operationId === operationId)
        throw new Error('Resolve the original payment before forgetting its receipt');
      const decisions = await this.storage.decisions(context, owner, assertCurrent);
      await this.storage.save(
        context,
        owner,
        'order-decisions',
        decisions.filter((value) => value.operationId !== operationId),
        assertCurrent,
      );
    });
  }
}
