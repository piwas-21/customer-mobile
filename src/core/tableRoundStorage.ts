import type { SecretStore } from './credentials';
import { scopedTableRound, type TableRoundRecord } from './tableRoundRecord';
import { ScopedPrivateRecordStorage } from './scopedPrivateRecordStorage';
export class TableRoundStorage extends ScopedPrivateRecordStorage<TableRoundRecord> {
  constructor(store: SecretStore) {
    super(store, {
      kind: 'table-round-operation',
      capture: scopedTableRound,
      principal: (record) => record.principal,
      resolved: (record) => record.resolution !== null,
    });
  }
}
