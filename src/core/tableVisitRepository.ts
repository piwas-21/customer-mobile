import { TableRoundStorage } from './tableRoundStorage';
import { tableVisitIdentitySchema, type TableVisitIdentity } from '../api/tableVisitContract';
import { removeAcknowledgedSecret, saveAcknowledgedSecret } from './acknowledgedSecret';
import { principalSchema, secretKey, type Principal, type SecretStore } from './credentials';
import { scopedTableVisit, type TableVisitRecord } from './tableVisitRecord';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
export class TableVisitRepository {
  constructor(
    private readonly store: SecretStore,
    private readonly writes: SerialTasks,
  ) {}
  read(context: TenantContext, principal: Principal, guard: () => void) {
    const owner = principalSchema.parse(principal);
    return this.writes.run(() => this.readInside(context, owner, guard));
  }
  install(
    context: TenantContext,
    principal: Principal,
    input: TableVisitIdentity,
    guard: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    const identity = tableVisitIdentitySchema.parse(input);
    const record = scopedTableVisit(context, owner, {
      schemaVersion: 1,
      environment: context.environment,
      tenantId: context.tenant.id,
      principal: owner,
      identity,
    });
    return this.writes.run(async () => {
      await new TableRoundStorage(this.store).assertResolved(context, owner, guard);
      if (await this.readInside(context, owner, guard)) throw new ApiFailure(409, 'refused');
      guard();
      if (Date.parse(identity.expiresAt) <= Date.now()) throw new ApiFailure(409, 'refused');
      await saveAcknowledgedSecret(
        this.store,
        secretKey(context, 'table-participant', owner),
        JSON.stringify(record),
      );
      guard();
      return record;
    });
  }
  leave(context: TenantContext, principal: Principal, serviceSessionId: string, guard: () => void) {
    const owner = principalSchema.parse(principal);
    const id = canonicalUuidSchema.parse(serviceSessionId);
    return this.writes.run(async () => {
      const current = await this.readInside(context, owner, guard);
      if (current?.identity.serviceSessionId !== id) throw new ApiFailure(409, 'refused');
      guard();
      await removeAcknowledgedSecret(this.store, secretKey(context, 'table-participant', owner));
      guard();
    });
  }
  paymentSession(
    context: TenantContext,
    input: TableVisitRecord,
    createId: () => string,
    guard: () => void,
  ) {
    const owner = principalSchema.parse(input.principal);
    const expected = scopedTableVisit(context, owner, input);
    return this.writes.run(async () => {
      const visit = await this.readInside(context, owner, guard);
      if (
        JSON.stringify(visit) !== JSON.stringify(expected) ||
        Date.parse(expected.identity.expiresAt) <= Date.now()
      )
        throw new ApiFailure(409, 'refused');
      const key = secretKey(context, 'guest-session', owner);
      const existing = await this.store.get(key);
      guard();
      if (existing !== null) return canonicalUuidSchema.parse(existing);
      const basketClaim = await this.store.get(secretKey(context, 'basket-operation', owner));
      guard();
      if (basketClaim !== null) throw new ApiFailure(409, 'refused');
      // A diner can inspect staff-entered food without having created a native basket. This
      // local correlation ID grants no table authority and never replaces an existing session.
      const session = canonicalUuidSchema.parse(createId());
      await saveAcknowledgedSecret(this.store, key, session);
      guard();
      return session;
    });
  }
  private async readInside(
    context: TenantContext,
    principal: Principal,
    guard: () => void,
  ): Promise<TableVisitRecord | null> {
    guard();
    const raw = await this.store.get(secretKey(context, 'table-participant', principal));
    guard();
    return raw === null ? null : scopedTableVisit(context, principal, JSON.parse(raw));
  }
}
