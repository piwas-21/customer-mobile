import { type BasketAddInput } from '../api/basketRequest';
import { canonicalUuidSchema, emptyUuid } from './identifiers';
import {
  principalSchema,
  secretKey,
  type CredentialVault,
  type Principal,
  type SecretStore,
} from './credentials';
import {
  basketOperationRecordSchema,
  basketOperationIntentSchema,
  type BasketOperationIntent,
  immutableBasketOperation,
  type PendingBasketOperation,
} from './basketOperationRecord';
import { BasketOperationStorage } from './basketOperationStorage';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { PaymentOperationStorage } from './paymentOperationStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export type { PendingBasketOperation } from './basketOperationRecord';
type AssertCurrent = () => void;

// Shares SessionRepository's secure write queue, including durable logout cleanup.
export class BasketOperationRepository {
  private readonly storage: BasketOperationStorage;
  constructor(
    private readonly store: SecretStore,
    private readonly vault: CredentialVault,
    private readonly tasks: SerialTasks,
  ) {
    this.storage = new BasketOperationStorage(store, vault);
  }

  prepare(
    context: TenantContext,
    principal: Principal,
    input: BasketAddInput,
    createId: () => string,
    assertCurrent: AssertCurrent,
    policy: 'recover-or-create' | 'create-only' = 'recover-or-create',
  ): Promise<PendingBasketOperation> {
    return this.prepareRequest(
      context,
      principal,
      { schemaVersion: 1, request: input },
      createId,
      assertCurrent,
      policy,
    );
  }

  prepareRequest(
    context: TenantContext,
    principal: Principal,
    input: BasketOperationIntent,
    createId: () => string,
    assertCurrent: AssertCurrent,
    policy: 'recover-or-create' | 'create-only' = 'recover-or-create',
  ): Promise<PendingBasketOperation> {
    const owner = principalSchema.parse(principal);
    const intent = basketOperationIntentSchema.parse(input);
    const request = intent.request;
    return this.tasks.run(async () => {
      this.storage.check(context, assertCurrent);
      const previous = await this.storage.read(context, owner, assertCurrent);
      if (previous) {
        if (previous.cancellationRequested)
          throw new Error('Finish cancelling the pending basket change first.');
        if (policy === 'create-only')
          throw new Error('Recover the pending basket change before preparing another.');
        if (
          previous.schemaVersion !== intent.schemaVersion ||
          JSON.stringify(previous.request) !== JSON.stringify(request)
        )
          throw new Error('Recover the pending basket change before preparing another.');
        return immutableBasketOperation(previous);
      }
      await new CancellationOperationStorage(this.store).assertResolved(
        context,
        owner,
        assertCurrent,
      );
      await new PaymentOperationStorage(this.store).assertResolved(context, owner, assertCurrent);
      // The same secure queue arbitrates basket and order claims across controller instances.
      // Any unresolved proof (including malformed data) blocks a new basket effect.
      if ((await this.store.get(secretKey(context, 'order-operation-proof', owner))) !== null)
        throw new Error('Resolve the pending order before changing the basket');
      this.storage.check(context, assertCurrent);
      const existingSession = await this.vault.capability(context, 'guest-session', owner);
      this.storage.check(context, assertCurrent);
      const reviewed =
        intent.schemaVersion === 2 ||
        (intent.schemaVersion === 3 && intent.request.expectedBasketId !== emptyUuid);
      if (reviewed && existingSession === null)
        throw new Error('A reviewed basket session is required for an edit.');
      const record = basketOperationRecordSchema.parse({
        ...intent,
        environment: context.environment,
        tenantId: context.tenant.id,
        principal: owner,
        sessionId: existingSession ?? createId(),
        operationId: createId(),
        request,
        phase: existingSession === null ? 'installing' : 'ready',
      });
      // Persist the intended session BEFORE installation. A wrong readback cannot become a new identity.
      await this.storage.save(context, owner, record, assertCurrent);
      const ready =
        record.phase === 'installing'
          ? await this.storage.install(context, owner, record, assertCurrent)
          : record;
      return immutableBasketOperation(ready);
    });
  }

  load(
    context: TenantContext,
    principal: Principal,
    assertCurrent: AssertCurrent,
  ): Promise<PendingBasketOperation | null> {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(async () => {
      this.storage.check(context, assertCurrent);
      const record = await this.storage.read(context, owner, assertCurrent);
      return record ? immutableBasketOperation(record) : null;
    });
  }

  requestCancellation(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    assertCurrent: AssertCurrent,
  ): Promise<PendingBasketOperation> {
    const owner = principalSchema.parse(principal);
    canonicalUuidSchema.parse(operationId);
    return this.tasks.run(async () => {
      this.storage.check(context, assertCurrent);
      const previous = await this.storage.read(context, owner, assertCurrent);
      if (previous?.operationId !== operationId) throw new Error('Basket operation changed');
      if (previous.cancellationRequested) return immutableBasketOperation(previous);
      const cancelling = { ...previous, cancellationRequested: true as const };
      await this.storage.save(context, owner, cancelling, assertCurrent);
      return immutableBasketOperation(cancelling);
    });
  }

  // Call only after validated server application or cancellation proof. An old response cannot erase a newer operation.
  finish(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    assertCurrent: AssertCurrent,
  ): Promise<void> {
    const owner = principalSchema.parse(principal);
    canonicalUuidSchema.parse(operationId);
    return this.tasks.run(async () => {
      this.storage.check(context, assertCurrent);
      const operation = await this.storage.read(context, owner, assertCurrent);
      if (!operation) return;
      if (operation.operationId !== operationId) throw new Error('Basket operation changed');
      const key = secretKey(context, 'basket-operation', owner);
      await this.store.remove(key);
      if ((await this.store.get(key)) !== null)
        throw new Error('Secure basket operation removal incomplete');
      this.storage.check(context, assertCurrent);
    });
  }
}
