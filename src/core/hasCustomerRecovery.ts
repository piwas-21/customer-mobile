import { TablePlanStorage } from './tablePlanStorage';
import { TableRoundStorage } from './tableRoundStorage';
import { TablePaymentStorage } from './tablePaymentStorage';
import { ReservationOperationStorage } from './reservationOperationStorage';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { scopedTableVisit } from './tableVisitRecord';
import { scopedPaymentRecord } from './paymentOperationRecord';
import { scopedOrderDecisions } from './orderDecisions';
import { assertOrderProofScope, orderOperationProofSchema } from './orderOperationProof';
import { secretKey, type SecretStore } from './credentials';
import type { TenantContext } from './tenantContext';
export async function hasCustomerRecovery(
  store: SecretStore,
  context: TenantContext,
  principal: { kind: 'customer'; id: string },
) {
  const raw = await store.get(secretKey(context, 'order-operation-proof', principal));
  if (raw !== null) {
    const proof = orderOperationProofSchema.parse(JSON.parse(raw));
    assertOrderProofScope(context, proof);
    if (proof.principal.kind !== principal.kind || proof.principal.id !== principal.id)
      throw new Error('Order recovery owner mismatch');
    return true;
  }
  const saved = await store.get(secretKey(context, 'order-decisions', principal));
  const records = scopedOrderDecisions(context, principal, saved === null ? [] : JSON.parse(saved));
  if (records.some((record) => record.outcome === 'Applied')) return true;
  const payment = await store.get(secretKey(context, 'payment', principal));
  if (payment !== null) {
    scopedPaymentRecord(context, principal, JSON.parse(payment));
    return true;
  }
  const cancellation = await new CancellationOperationStorage(store).read(
    context,
    principal,
    () => {},
  );
  const reservation = await new ReservationOperationStorage(store).read(
    context,
    principal,
    () => {},
  );
  const tableRaw = await store.get(secretKey(context, 'table-participant', principal));
  const table =
    tableRaw === null ? null : scopedTableVisit(context, principal, JSON.parse(tableRaw));
  const round = await new TableRoundStorage(store).read(context, principal, () => {});
  const contribution = await new TablePaymentStorage(store).read(context, principal, () => {});
  const plan = await new TablePlanStorage(store).read(context, principal, () => {});
  return (
    cancellation?.resolution === null ||
    Boolean(reservation || table || round || contribution || plan)
  );
}
