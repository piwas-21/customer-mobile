import { readOrderReceipt } from '../api/orderReceipt';
import { recoverCustomerPayment } from '../api/customerPayment';
import { decisionProof, orderDecisionSchema, type OrderDecision } from './orderDecisions';
import { scopedPaymentRecord, type PaymentOperationRecord } from './paymentOperationRecord';
import type { OrderOperationProof } from './orderOperationProof';
import type { TenantContext } from './tenantContext';
import type { CustomerTransport } from './transport';
export type OrderReadAuthority = {
  proof: OrderOperationProof;
  paymentOrderId?: string | undefined;
};
type ReadOriginal = <T>(
  proof: OrderOperationProof,
  read: (guard: () => void) => Promise<T>,
  paymentOrderId?: string,
) => Promise<T>;
export class CustomerOrderReads {
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly readOriginal: ReadOriginal,
  ) {}
  receipt(saved: OrderDecision, locale: string) {
    const decision = orderDecisionSchema.parse(saved);
    return this.readOriginal(decisionProof(decision), (guard) =>
      readOrderReceipt(this.client, this.context, decision, guard, locale),
    );
  }
  payment(saved: PaymentOperationRecord, locale: string) {
    const record = scopedPaymentRecord(this.context, saved.proof.principal, saved);
    return this.readOriginal(
      record.proof,
      (guard) => recoverCustomerPayment(this.client, this.context, record, guard, locale),
      record.orderId,
    );
  }
}
