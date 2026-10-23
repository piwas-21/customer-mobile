import type { TablePlanRecord } from './tablePlanRecord';
import type { TablePaymentRecord } from './tablePaymentRecord';
import type { TableRoundRecord } from './tableRoundRecord';
import type { ReservationOperationRecord } from './reservationOperationRecord';
import type { CancellationOperationRecord } from './cancellationOperationRecord';
import type { OrderOperationProof } from './orderOperationProof';
import type { Principal } from './credentials';
export type CustomerRecoveryAuthority =
  | {
      proof: OrderOperationProof;
      paymentOrderId?: string | undefined;
      cancellation?: never;
      reservation?: never;
      tableRound?: never;
      tableContribution?: never;
      tablePlan?: never;
      assertCurrent?: never;
    }
  | {
      cancellation: CancellationOperationRecord;
      proof?: never;
      paymentOrderId?: never;
      reservation?: never;
      tableRound?: never;
      tableContribution?: never;
      tablePlan?: never;
      assertCurrent?: never;
    }
  | {
      reservation: ReservationOperationRecord;
      tableRound?: never;
      tableContribution?: never;
      tablePlan?: never;
      assertCurrent: () => void;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
    }
  | {
      tableRound: TableRoundRecord;
      tableContribution?: never;
      tablePlan?: never;
      assertCurrent: () => void;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
      reservation?: never;
    }
  | {
      tableContribution: TablePaymentRecord;
      tablePlan?: never;
      assertCurrent: () => void;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
      reservation?: never;
      tableRound?: never;
    }
  | {
      tablePlan: TablePlanRecord;
      assertCurrent: () => void;
      proof?: never;
      paymentOrderId?: never;
      cancellation?: never;
      reservation?: never;
      tableRound?: never;
      tableContribution?: never;
    };
export function recoveryPrincipal(authority: CustomerRecoveryAuthority): Principal {
  if (authority.tablePlan) return authority.tablePlan.principal;
  if (authority.tableContribution) return authority.tableContribution.principal;
  if (authority.tableRound) return authority.tableRound.principal;
  if (authority.reservation) return authority.reservation.principal;
  if (authority.cancellation) return authority.cancellation.principal;
  return authority.proof.principal;
}
