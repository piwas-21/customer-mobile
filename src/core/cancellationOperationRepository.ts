import { TableRoundStorage } from './tableRoundStorage';
import {
  bindCancellationResolution,
  cancellationPreparationSchema,
  cancellationResolutionSchema,
  type CancellationPreparation,
  type CancellationResolution,
} from '../api/orderCancellationContract';
import {
  cancellationAuthoritySchema,
  scopedCancellationRecord,
  type CancellationAuthority,
  type CancellationOperationRecord,
} from './cancellationOperationRecord';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { principalSchema, type Principal, type SecretStore } from './credentials';
import { canonicalUuidSchema } from './identifiers';
import { decisionProof } from './orderDecisions';
import { OrderOperationStorage } from './orderOperationStorage';
import { PaymentOperationStorage } from './paymentOperationStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export class CancellationOperationRepository {
  private readonly storage: CancellationOperationStorage;
  constructor(
    private readonly store: SecretStore,
    private readonly tasks: SerialTasks,
  ) {
    this.storage = new CancellationOperationStorage(store);
  }
  load(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(() => this.storage.read(context, owner, assertCurrent));
  }
  prepare(
    context: TenantContext,
    principal: Principal,
    authority: CancellationAuthority,
    preparation: CancellationPreparation,
    createId: () => string,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    const captured = cancellationAuthoritySchema.parse(authority);
    const prepared = cancellationPreparationSchema.parse(preparation);
    return this.tasks.run(async () => {
      if (context.tenant.status !== 'active' || !prepared.allowed || prepared.payloadHash === null)
        throw new Error('This order action is unavailable');
      const previous = await this.storage.read(context, owner, assertCurrent);
      if (previous?.resolution === null) throw new Error('Resolve the original order action first');
      await new TableRoundStorage(this.store).assertResolved(context, owner, assertCurrent);
      const orders = new OrderOperationStorage(this.store);
      await orders.ensureBasketUnclaimed(context, owner, assertCurrent);
      if (await orders.read(context, owner, assertCurrent))
        throw new Error('Resolve the original order first');
      await new PaymentOperationStorage(this.store).assertResolved(context, owner, assertCurrent);
      if (captured.kind === 'original') {
        const decisions = await orders.decisions(context, owner, assertCurrent);
        const saved = decisions.find(
          (value) =>
            value.operationId === captured.proof.operationId &&
            value.outcome === 'Applied' &&
            value.orderId === prepared.orderId,
        );
        if (!saved || JSON.stringify(decisionProof(saved)) !== JSON.stringify(captured.proof))
          throw new Error('Original order receipt changed');
      }
      const operationId = canonicalUuidSchema.parse(createId());
      if (operationId === previous?.intent.operationId)
        throw new Error('Order action identity was reused');
      const record = scopedCancellationRecord(context, owner, {
        schemaVersion: 1,
        environment: context.environment,
        tenantId: context.tenant.id,
        principal: owner,
        authority: captured,
        recordedAt: new Date().toISOString(),
        resolution: null,
        intent: {
          schemaVersion: 1,
          operationId,
          orderId: prepared.orderId,
          expectedVersion: prepared.expectedVersion,
          payloadHash: prepared.payloadHash,
        },
      });
      await this.storage.save(context, record, assertCurrent);
      return record;
    });
  }
  finish(
    context: TenantContext,
    record: CancellationOperationRecord,
    result: CancellationResolution,
    assertCurrent: () => void,
  ) {
    const captured = scopedCancellationRecord(context, record.principal, record);
    const resolution = bindCancellationResolution(
      captured.intent,
      cancellationResolutionSchema.parse(result),
      'submit',
    );
    return this.tasks.run(async () => {
      const current = await this.storage.read(context, captured.principal, assertCurrent);
      if (
        !current ||
        JSON.stringify({ ...current, resolution: null }) !==
          JSON.stringify({ ...captured, resolution: null })
      )
        throw new Error('Original order action changed');
      if (current.resolution !== null) {
        if (JSON.stringify(current.resolution) !== JSON.stringify(resolution))
          throw new Error('Conflicting canonical order action');
        return current;
      }
      const next = scopedCancellationRecord(context, current.principal, { ...current, resolution });
      await this.storage.save(context, next, assertCurrent);
      return next;
    });
  }
}
