import { prepareOriginalCancellation, resolveCancellation } from '../api/orderCancellation';
import {
  scopedCancellationRecord,
  type CancellationOperationRecord,
} from './cancellationOperationRecord';
import { resolveReservationAttempt } from '../api/reservationCreate';
import {
  scopedReservationRecord,
  type ReservationOperationRecord,
} from './reservationOperationRecord';
import type { Principal } from './credentials';
import { readOrderReceipt } from '../api/orderReceipt';
import { recoverCustomerPayment } from '../api/customerPayment';
import { decisionProof, orderDecisionSchema, type OrderDecision } from './orderDecisions';
import { scopedPaymentRecord, type PaymentOperationRecord } from './paymentOperationRecord';
import type { OrderOperationProof } from './orderOperationProof';
import type { TenantContext } from './tenantContext';
import type { CustomerTransport } from './transport';
export type CustomerRecoveryAuthority =
  | {
      proof: OrderOperationProof;
      paymentOrderId?: string | undefined;
      cancellation?: never;
      reservation?: never;
    }
  | {
      cancellation: CancellationOperationRecord;
      proof?: never;
      paymentOrderId?: never;
      reservation?: never;
    }
  | {
      reservation: ReservationOperationRecord;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
    };
export function recoveryPrincipal(authority: CustomerRecoveryAuthority): Principal {
  if (authority.reservation) return authority.reservation.principal;
  if (authority.cancellation) return authority.cancellation.principal;
  return authority.proof.principal;
}
type ReadPrivate = <T>(
  authority: CustomerRecoveryAuthority,
  read: (guard: () => void) => Promise<T>,
) => Promise<T>;
export class CustomerRecoveryReads {
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
  reservation(
    saved: ReservationOperationRecord,
    phase: 'recover' | 'cancel-attempt',
    locale: string,
  ) {
    const record = scopedReservationRecord(this.context, saved.principal, saved);
    return this.readPrivate({ reservation: record }, (guard) =>
      resolveReservationAttempt(this.client, this.context, record, phase, guard, locale),
    );
  }
}
