import { basketAddInputSchema, type BasketAddInput } from '../api/basketRequest';
import { canonicalUuidSchema } from './identifiers';
import {
  principalSchema,
  secretKey,
  type CredentialVault,
  type Principal,
  type SecretStore,
} from './credentials';
import {
  basketOperationRecordSchema,
  immutableBasketOperation,
  type BasketOperationRecord,
  type PendingBasketOperation,
} from './basketOperationRecord';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export type { PendingBasketOperation } from './basketOperationRecord';
type AssertCurrent = () => void;

// Shares SessionRepository's secure write queue, including durable logout cleanup.
export class BasketOperationRepository {
  constructor(
    private readonly store: SecretStore,
    private readonly vault: CredentialVault,
    private readonly tasks: SerialTasks,
  ) {}

  prepare(
    context: TenantContext,
    principal: Principal,
    input: BasketAddInput,
    createId: () => string,
    assertCurrent: AssertCurrent,
  ): Promise<PendingBasketOperation> {
    const owner = principalSchema.parse(principal);
    const request = basketAddInputSchema.parse(input);
    return this.tasks.run(async () => {
      this.check(context, assertCurrent);
      const previous = await this.read(context, owner, assertCurrent);
      if (previous) {
        if (JSON.stringify(previous.request) !== JSON.stringify(request))
          throw new Error('Recover the pending basket add before preparing another.');
        return immutableBasketOperation(previous);
      }
      const existingSession = await this.vault.capability(context, 'guest-session', owner);
      this.check(context, assertCurrent);
      const record = basketOperationRecordSchema.parse({
        schemaVersion: 1,
        environment: context.environment,
        tenantId: context.tenant.id,
        principal: owner,
        sessionId: existingSession ?? createId(),
        operationId: createId(),
        request,
        phase: existingSession === null ? 'installing' : 'ready',
      });
      // Persist the intended session BEFORE installation. A wrong readback cannot become a new identity.
      await this.save(context, owner, record, assertCurrent);
      const ready =
        record.phase === 'installing'
          ? await this.install(context, owner, record, assertCurrent)
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
      this.check(context, assertCurrent);
      const record = await this.read(context, owner, assertCurrent);
      return record ? immutableBasketOperation(record) : null;
    });
  }

  // Call only after a validated server success. An old response cannot erase a newer operation.
  finish(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    assertCurrent: AssertCurrent,
  ): Promise<void> {
    const owner = principalSchema.parse(principal);
    canonicalUuidSchema.parse(operationId);
    return this.tasks.run(async () => {
      this.check(context, assertCurrent);
      const operation = await this.read(context, owner, assertCurrent);
      if (!operation) return;
      if (operation.operationId !== operationId) throw new Error('Basket operation changed');
      const key = secretKey(context, 'basket-operation', owner);
      await this.store.remove(key);
      if ((await this.store.get(key)) !== null)
        throw new Error('Secure basket operation removal incomplete');
      this.check(context, assertCurrent);
    });
  }

  private async read(
    context: TenantContext,
    principal: Principal,
    assertCurrent: AssertCurrent,
  ): Promise<BasketOperationRecord | null> {
    const value = await this.store.get(secretKey(context, 'basket-operation', principal));
    this.check(context, assertCurrent);
    if (value === null) return null;
    const record = basketOperationRecordSchema.parse(JSON.parse(value));
    if (
      record.environment !== context.environment ||
      record.tenantId !== context.tenant.id ||
      record.principal.kind !== principal.kind ||
      record.principal.id !== principal.id
    )
      throw new Error('Basket operation scope changed');
    if (record.phase === 'installing')
      return this.install(context, principal, record, assertCurrent);
    const session = await this.vault.capability(context, 'guest-session', principal);
    this.check(context, assertCurrent);
    if (session !== record.sessionId) throw new Error('Basket operation scope changed');
    return record;
  }

  private async install(
    context: TenantContext,
    principal: Principal,
    record: BasketOperationRecord,
    assertCurrent: AssertCurrent,
  ): Promise<BasketOperationRecord> {
    const session = await this.vault.capability(context, 'guest-session', principal);
    this.check(context, assertCurrent);
    if (session !== null && session !== record.sessionId)
      throw new Error('Basket operation scope changed');
    if (session === null)
      await this.vault.saveCapability(context, 'guest-session', principal, record.sessionId);
    if ((await this.vault.capability(context, 'guest-session', principal)) !== record.sessionId)
      throw new Error('Secure basket session save incomplete');
    this.check(context, assertCurrent);
    const ready: BasketOperationRecord = { ...record, phase: 'ready' };
    await this.save(context, principal, ready, assertCurrent);
    return ready;
  }

  private async save(
    context: TenantContext,
    principal: Principal,
    record: BasketOperationRecord,
    assertCurrent: AssertCurrent,
  ): Promise<void> {
    this.check(context, assertCurrent);
    const key = secretKey(context, 'basket-operation', principal);
    const wire = JSON.stringify(record);
    await this.store.set(key, wire);
    if ((await this.store.get(key)) !== wire)
      throw new Error('Secure basket operation save incomplete');
    this.check(context, assertCurrent);
  }

  private check(context: TenantContext, assertCurrent: AssertCurrent): void {
    if (context.signal.aborted) throw new Error('Restaurant context changed');
    assertCurrent();
  }
}
