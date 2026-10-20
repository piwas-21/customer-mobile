import { secretKey, type Principal, type SecretStore } from './credentials';
import {
  scopedCancellationRecord,
  cancellationRecordForCleanup,
  type CancellationOperationRecord,
} from './cancellationOperationRecord';
import type { TenantContext } from './tenantContext';
// Calls share SessionRepository's secure queue; no network request holds that queue.
export class CancellationOperationStorage {
  constructor(private readonly store: SecretStore) {}
  async read(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    this.check(context, assertCurrent);
    const raw = await this.store.get(secretKey(context, 'order-cancellation', principal));
    this.check(context, assertCurrent);
    return raw === null ? null : scopedCancellationRecord(context, principal, JSON.parse(raw));
  }
  async readForCleanup(context: TenantContext, principal: Principal) {
    const raw = await this.store.get(secretKey(context, 'order-cancellation', principal));
    return raw === null ? null : cancellationRecordForCleanup(context, principal, JSON.parse(raw));
  }
  async clearResolvedForCleanup(context: TenantContext, principal: Principal) {
    const record = await this.readForCleanup(context, principal);
    if (!record?.resolution) return;
    await this.remove(context, principal);
  }
  async assertResolved(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    if ((await this.read(context, principal, assertCurrent))?.resolution === null)
      throw new Error('Resolve the original order action before starting another change');
  }
  async save(
    context: TenantContext,
    value: CancellationOperationRecord,
    assertCurrent: () => void,
  ) {
    const record = scopedCancellationRecord(context, value.principal, value);
    this.check(context, assertCurrent);
    const key = secretKey(context, 'order-cancellation', record.principal);
    const wire = JSON.stringify(record);
    await this.store.set(key, wire);
    if ((await this.store.get(key)) !== wire)
      throw new Error('Secure order action save incomplete');
    this.check(context, assertCurrent);
  }
  private async remove(context: TenantContext, principal: Principal) {
    const key = secretKey(context, 'order-cancellation', principal);
    await this.store.remove(key);
    if ((await this.store.get(key)) !== null)
      throw new Error('Secure order action removal incomplete');
  }
  private check(context: TenantContext, assertCurrent: () => void) {
    if (context.signal.aborted) throw new Error('Restaurant changed');
    assertCurrent();
  }
}
