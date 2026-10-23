import { ApiFailure } from './apiFailure';
import { principalSchema, type Principal } from './credentials';
import { canonicalUuidSchema } from './identifiers';
import type { ScopedPrivateRecordStorage } from './scopedPrivateRecordStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
type OriginalRecord = {
  principal: Principal;
  proof: { operationId: string };
  cancellationRequested: boolean;
};
// Both table operations use the installation's single queue and exact saved identity.
export abstract class PrivateOperationRepository<T extends OriginalRecord> {
  constructor(
    protected readonly storage: ScopedPrivateRecordStorage<T>,
    protected readonly writes: SerialTasks,
    private readonly resolved: (record: T) => boolean,
  ) {}
  load(context: TenantContext, principal: Principal, guard: () => void) {
    const owner = principalSchema.parse(principal);
    return this.writes.run(() => this.storage.read(context, owner, guard));
  }
  requestCancellation(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    guard: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    const id = canonicalUuidSchema.parse(operationId);
    return this.writes.run(async () => {
      const record = await this.original(context, owner, id, guard);
      if (this.resolved(record) || record.cancellationRequested) return record;
      return this.storage.save(context, { ...record, cancellationRequested: true }, guard);
    });
  }
  protected async original(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    guard: () => void,
  ) {
    const record = await this.storage.read(context, principal, guard);
    if (record?.proof.operationId !== operationId) throw new ApiFailure(409, 'refused');
    return record;
  }
}
