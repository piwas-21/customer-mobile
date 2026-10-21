import { saveAcknowledgedSecret, removeAcknowledgedSecret } from './acknowledgedSecret';
import { secretKey, type Principal, type SecretStore } from './credentials';
import { scopedTableRound, type TableRoundRecord } from './tableRoundRecord';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './apiFailure';

// The repository owns the shared serial queue around these private storage operations.
export class TableRoundStorage {
  constructor(private readonly store: SecretStore) {}
  async read(context: TenantContext, principal: Principal, guard: () => void) {
    this.check(context, guard);
    const raw = await this.store.get(secretKey(context, 'table-round-operation', principal));
    this.check(context, guard);
    return raw === null ? null : scopedTableRound(context, principal, JSON.parse(raw));
  }
  async save(context: TenantContext, input: TableRoundRecord, guard: () => void) {
    const record = scopedTableRound(context, input.principal, input);
    this.check(context, guard);
    await saveAcknowledgedSecret(
      this.store,
      secretKey(context, 'table-round-operation', record.principal),
      JSON.stringify(record),
    );
    this.check(context, guard);
    return record;
  }
  async forgetResolved(context: TenantContext, input: TableRoundRecord, guard: () => void) {
    const expected = scopedTableRound(context, input.principal, input);
    const current = await this.read(context, expected.principal, guard);
    if (!current?.resolution || JSON.stringify(current) !== JSON.stringify(expected))
      throw new ApiFailure(409, 'refused');
    await removeAcknowledgedSecret(
      this.store,
      secretKey(context, 'table-round-operation', expected.principal),
    );
    this.check(context, guard);
  }
  private check(context: TenantContext, guard: () => void) {
    if (context.signal.aborted) throw new ApiFailure(409, 'refused');
    guard();
  }
}
