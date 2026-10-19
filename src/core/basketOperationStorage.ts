import { secretKey, type CredentialVault, type Principal, type SecretStore } from './credentials';
import { basketOperationRecordSchema, type BasketOperationRecord } from './basketOperationRecord';
import type { TenantContext } from './tenantContext';
type AssertCurrent = () => void;

// Used only inside BasketOperationRepository's shared secure queue.
export class BasketOperationStorage {
  constructor(
    private readonly store: SecretStore,
    private readonly vault: CredentialVault,
  ) {}
  async read(
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

  async install(
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

  async save(
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

  check(context: TenantContext, assertCurrent: AssertCurrent): void {
    if (context.signal.aborted) throw new Error('Restaurant context changed');
    assertCurrent();
  }
}
