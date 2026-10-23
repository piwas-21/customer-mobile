import type { SecretStore } from './credentials';
import { scopedTablePlan, type TablePlanRecord } from './tablePlanRecord';
import { ScopedPrivateRecordStorage } from './scopedPrivateRecordStorage';
export class TablePlanStorage extends ScopedPrivateRecordStorage<TablePlanRecord> {
  constructor(store: SecretStore) {
    super(store, {
      kind: 'table-plan-operation',
      capture: scopedTablePlan,
      principal: (record) => record.principal,
      resolved: (record) => record.resolution !== null,
    });
  }
}
