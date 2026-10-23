import { PrivateOperationRepository } from './privateOperationRepository';
import { bindPreparedTablePlan } from '../api/tablePlanPrepared';
import { bindTablePlanResolution } from '../api/tablePlanResolution';
import { scopedTablePlanPreparation, type TablePlanPreparation } from './tablePlanPreparation';
import { scopedTablePlan, type TablePlanRecord } from './tablePlanRecord';
import { installTablePlan } from './tablePlanInstallation';
import { TablePlanStorage } from './tablePlanStorage';
import { ApiFailure } from './apiFailure';
import type { SecretStore } from './credentials';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export class TablePlanRepository extends PrivateOperationRepository<TablePlanRecord> {
  constructor(
    private readonly store: SecretStore,
    writes: SerialTasks,
  ) {
    super(new TablePlanStorage(store), writes, (record) => record.resolution !== null);
  }
  install(context: TenantContext, input: TablePlanPreparation, value: unknown, guard: () => void) {
    const preparation = scopedTablePlanPreparation(context, input.principal, input);
    const prepared = bindPreparedTablePlan(preparation.intent, preparation.currency, value);
    return this.writes.run(() =>
      installTablePlan(this.store, context, preparation, prepared, guard),
    );
  }
  finish(context: TenantContext, input: TablePlanRecord, value: unknown, guard: () => void) {
    const expected = scopedTablePlan(context, input.principal, input);
    const result = bindTablePlanResolution(expected.intent, value, 'recover');
    return this.writes.run(async () => {
      const current = await this.unchanged(context, expected, guard, true);
      if (result.outcome === 'unseen') {
        if (current.resolution) throw new ApiFailure(409, 'refused');
        return current;
      }
      if (current.resolution && JSON.stringify(current.resolution) !== JSON.stringify(result))
        throw new ApiFailure(409, 'refused');
      return this.storage.save(context, { ...current, resolution: result }, guard);
    });
  }
  acknowledge(context: TenantContext, input: TablePlanRecord, guard: () => void) {
    const expected = scopedTablePlan(context, input.principal, input);
    return this.writes.run(() => this.storage.forgetResolved(context, expected, guard));
  }
}
