import {
  customerPaymentDecisionSchema,
  type CustomerPaymentDecision,
} from '../api/customerPaymentDecision';
import { principalSchema, type Principal, type SecretStore } from './credentials';
import { scopedPaymentRecord, type PaymentOperationRecord } from './paymentOperationRecord';
import { PaymentOperationStorage } from './paymentOperationStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export class PaymentOperationRepository {
  private readonly storage: PaymentOperationStorage;
  constructor(
    store: SecretStore,
    private readonly tasks: SerialTasks,
  ) {
    this.storage = new PaymentOperationStorage(store);
  }
  load(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(() => this.storage.read(context, owner, assertCurrent));
  }
  resolve(
    context: TenantContext,
    record: PaymentOperationRecord,
    decision: CustomerPaymentDecision,
    assertCurrent: () => void,
  ) {
    const captured = scopedPaymentRecord(context, record.proof.principal, record);
    const response = customerPaymentDecisionSchema.parse(decision);
    return this.tasks.run(() => this.storage.resolve(context, captured, response, assertCurrent));
  }
}
