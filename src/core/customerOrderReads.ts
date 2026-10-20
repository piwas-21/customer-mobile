import { prepareOriginalCancellation, resolveCancellation } from '../api/orderCancellation';
import {
  scopedCancellationRecord,
  type CancellationOperationRecord,
} from './cancellationOperationRecord';
import type { Principal } from './credentials';
import { readOrderReceipt } from '../api/orderReceipt';
import { recoverCustomerPayment } from '../api/customerPayment';
import { decisionProof, orderDecisionSchema, type OrderDecision } from './orderDecisions';
import { scopedPaymentRecord, type PaymentOperationRecord } from './paymentOperationRecord';
import type { OrderOperationProof } from './orderOperationProof';
import type { TenantContext } from './tenantContext';
import type { CustomerTransport } from './transport';
export type OrderReadAuthority =
  | {
      proof: OrderOperationProof;
      paymentOrderId?: string | undefined;
      cancellation?: never;
    }
  | {
      cancellation: CancellationOperationRecord;
      proof?: never;
      paymentOrderId?: never;
    };
export const orderReadPrincipal = (authority: OrderReadAuthority): Principal =>
  authority.cancellation ? authority.cancellation.principal : authority.proof.principal;
type ReadPrivate = <T>(
  authority: OrderReadAuthority,
  read: (guard: () => void) => Promise<T>,
) => Promise<T>;
export class CustomerOrderReads {
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly readPrivate: ReadPrivate,
  ) {}
  receipt(saved: OrderDecision, locale: string) {
    const decision = orderDecisionSchema.parse(saved);
    return this.readPrivate({ proof: decisionProof(decision) }, (guard) =>
      readOrderReceipt(this.client, this.context, decision, guard, locale),
    );
  }
  payment(saved: PaymentOperationRecord, locale: string) {
    const record = scopedPaymentRecord(this.context, saved.proof.principal, saved);
    return this.readPrivate({ proof: record.proof, paymentOrderId: record.orderId }, (guard) =>
      recoverCustomerPayment(this.client, this.context, record, guard, locale),
    );
  }
  prepareCancellation(saved: OrderDecision, locale: string) {
    const decision = orderDecisionSchema.parse(saved);
    return this.readPrivate({ proof: decisionProof(decision) }, (guard) =>
      prepareOriginalCancellation(this.client, this.context, decision, guard, locale),
    );
  }
  cancellation(saved: CancellationOperationRecord, locale: string) {
    const record = scopedCancellationRecord(this.context, saved.principal, saved);
    return this.readPrivate({ cancellation: record }, (guard) =>
      resolveCancellation(this.client, this.context, record, 'recover', guard, locale),
    );
  }
}
