import type { SecretStore } from './credentials';
import {
  scopedTablePayment,
  tablePaymentResolved,
  type TablePaymentRecord,
} from './tablePaymentRecord';
import { ScopedPrivateRecordStorage } from './scopedPrivateRecordStorage';
export class TablePaymentStorage extends ScopedPrivateRecordStorage<TablePaymentRecord> {
  constructor(store: SecretStore) {
    super(store, {
      kind: 'table-payment-operation',
      capture: scopedTablePayment,
      principal: (record) => record.principal,
      resolved: tablePaymentResolved,
    });
  }
}
