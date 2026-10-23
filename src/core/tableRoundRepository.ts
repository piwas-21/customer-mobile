import { PrivateOperationRepository } from './privateOperationRepository';
import {
  bindPreparedTableRound,
  bindTableRoundResolution,
  type TableRoundResolution,
} from '../api/tableRoundContract';
import { ApiFailure } from './apiFailure';
import type { SecretStore } from './credentials';
import { installTableRound } from './tableRoundInstallation';
import { scopedRoundPreparation, type TableRoundPreparation } from './tableRoundPreparation';
import { scopedTableRound, type TableRoundRecord } from './tableRoundRecord';
import { TableRoundStorage } from './tableRoundStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';

export class TableRoundRepository extends PrivateOperationRepository<TableRoundRecord> {
  constructor(
    private readonly store: SecretStore,
    writes: SerialTasks,
  ) {
    super(new TableRoundStorage(store), writes, (record) => record.resolution !== null);
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
  finish(
    context: TenantContext,
    input: TableRoundRecord,
    value: TableRoundResolution,
    guard: () => void,
  ) {
    const expected = scopedTableRound(context, input.principal, input);
    const resolution = bindTableRoundResolution(expected.intent, value, 'recover');
    return this.writes.run(async () => {
      const current = await this.unchanged(context, expected, guard, true);
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
}
