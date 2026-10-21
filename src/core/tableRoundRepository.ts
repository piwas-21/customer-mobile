import {
  bindPreparedTableRound,
  bindTableRoundResolution,
  type TableRoundResolution,
} from '../api/tableRoundContract';
import { ApiFailure } from './apiFailure';
import { principalSchema, type Principal, type SecretStore } from './credentials';
import { canonicalUuidSchema } from './identifiers';
import { installTableRound } from './tableRoundInstallation';
import { scopedRoundPreparation, type TableRoundPreparation } from './tableRoundPreparation';
import { scopedTableRound, type TableRoundRecord } from './tableRoundRecord';
import { TableRoundStorage } from './tableRoundStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';

export class TableRoundRepository {
  private readonly storage: TableRoundStorage;
  constructor(
    private readonly store: SecretStore,
    private readonly writes: SerialTasks,
  ) {
    this.storage = new TableRoundStorage(store);
  }
  load(context: TenantContext, principal: Principal, guard: () => void) {
    const owner = principalSchema.parse(principal);
    return this.writes.run(() => this.storage.read(context, owner, guard));
  }
  install(
    context: TenantContext,
    input: TableRoundPreparation,
    response: unknown,
    guard: () => void,
  ) {
    // Snapshot both inputs before entering a queue that may yield to another controller.
    const preparation = scopedRoundPreparation(context, input.principal, input);
    const prepared = bindPreparedTableRound(preparation.intent, preparation.currency, response);
    return this.writes.run(() =>
      installTableRound(this.store, context, preparation, prepared, guard),
    );
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
      if (record.resolution || record.cancellationRequested) return record;
      return this.storage.save(context, { ...record, cancellationRequested: true }, guard);
    });
  }
  finish(
    context: TenantContext,
    input: TableRoundRecord,
    value: TableRoundResolution,
    guard: () => void,
  ) {
    const expected = scopedTableRound(context, input.principal, input);
    const resolution = bindTableRoundResolution(expected.intent, value, 'recover');
    return this.writes.run(async () => {
      const current = await this.original(
        context,
        expected.principal,
        expected.proof.operationId,
        guard,
      );
      if (
        JSON.stringify({ ...current, cancellationRequested: false, resolution: null }) !==
        JSON.stringify({ ...expected, cancellationRequested: false, resolution: null })
      )
        throw new ApiFailure(409, 'refused');
      if (resolution.outcome === 'Unseen') {
        if (current.resolution) throw new ApiFailure(409, 'refused');
        return current;
      }
      if (current.resolution && JSON.stringify(current.resolution) !== JSON.stringify(resolution))
        throw new ApiFailure(409, 'refused');
      return this.storage.save(context, { ...current, resolution }, guard);
    });
  }
  acknowledge(context: TenantContext, input: TableRoundRecord, guard: () => void) {
    const expected = scopedTableRound(context, input.principal, input);
    return this.writes.run(() => this.storage.forgetResolved(context, expected, guard));
  }
  private async original(
    context: TenantContext,
    principal: Principal,
    id: string,
    guard: () => void,
  ) {
    const record = await this.storage.read(context, principal, guard);
    if (record?.proof.operationId !== id) throw new ApiFailure(409, 'refused');
    return record;
  }
}
