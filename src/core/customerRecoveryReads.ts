import { resolveTableContribution, resolveTableCheckout } from '../api/tableContributions';
import { scopedTablePayment, type TablePaymentRecord } from './tablePaymentRecord';
import { resolveTableRound } from '../api/tableRounds';
import { scopedTableRound, type TableRoundRecord } from './tableRoundRecord';
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
      tableRound?: never;
      tableContribution?: never;
      assertCurrent?: never;
    }
  | {
      cancellation: CancellationOperationRecord;
      proof?: never;
      paymentOrderId?: never;
      reservation?: never;
      tableRound?: never;
      tableContribution?: never;
      assertCurrent?: never;
    }
  | {
      reservation: ReservationOperationRecord;
      tableRound?: never;
      tableContribution?: never;
      assertCurrent: () => void;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
    }
  | {
      tableRound: TableRoundRecord;
      tableContribution?: never;
      assertCurrent: () => void;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
      reservation?: never;
    }
  | {
      tableContribution: TablePaymentRecord;
      assertCurrent: () => void;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
      reservation?: never;
      tableRound?: never;
    };
export function recoveryPrincipal(authority: CustomerRecoveryAuthority): Principal {
  if (authority.tableContribution) return authority.tableContribution.principal;
  if (authority.tableRound) return authority.tableRound.principal;
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
    assertCurrent: () => void,
  ) {
    const record = scopedReservationRecord(this.context, saved.principal, saved);
    return this.readPrivate({ reservation: record, assertCurrent }, (sessionGuard) => {
      const guard = () => {
        sessionGuard();
        assertCurrent();
      };
      guard();
      return resolveReservationAttempt(this.client, this.context, record, phase, guard, locale);
    });
  }
  tableRound(
    saved: TableRoundRecord,
    phase: 'recover' | 'cancel-attempt',
    locale: string,
    assertCurrent: () => void,
  ) {
    const record = scopedTableRound(this.context, saved.principal, saved);
    return this.readPrivate({ tableRound: record, assertCurrent }, (sessionGuard) => {
      const guard = () => {
        sessionGuard();
        assertCurrent();
      };
      guard();
      return resolveTableRound(this.client, this.context, record, { phase }, guard, locale);
    });
  }
  tableContribution(
    saved: TablePaymentRecord,
    phase: 'recover' | 'stop',
    locale: string,
    assertCurrent: () => void,
  ) {
    return this.originalContribution(saved, assertCurrent, (record, guard) =>
      resolveTableContribution(this.client, this.context, record, { phase }, guard, locale),
    );
  }
  tableCheckout(
    saved: TablePaymentRecord,
    phase: 'recover' | 'stop',
    locale: string,
    assertCurrent: () => void,
  ) {
    return this.originalContribution(saved, assertCurrent, (record, guard) =>
      resolveTableCheckout(this.client, this.context, record, { phase }, guard, locale),
    );
  }
  private originalContribution<T>(
    saved: TablePaymentRecord,
    assertCurrent: () => void,
    read: (record: TablePaymentRecord, guard: () => void) => Promise<T>,
  ) {
    const record = scopedTablePayment(this.context, saved.principal, saved);
    return this.readPrivate({ tableContribution: record, assertCurrent }, (sessionGuard) => {
      const guard = () => {
        sessionGuard();
        assertCurrent();
      };
      guard();
      return read(record, guard);
    });
  }
}
