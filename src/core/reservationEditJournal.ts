import { bindPreparedReservationEdit } from '../api/reservationEditContract';
import {
  reservationEditPreparationSchema,
  type ReservationEditPreparation,
} from './reservationEditPreparation';
import { assertReservationScope, preparedReservationRecord } from './reservationOperationRecord';
import type { ReservationOperationStorage } from './reservationOperationStorage';
import type { TenantContext } from './tenantContext';
// Runs only within SessionRepository's shared secure queue, before the single initial submission.
export async function installReservationEdit(
  storage: ReservationOperationStorage,
  context: TenantContext,
  input: ReservationEditPreparation,
  response: unknown,
  assertCurrent: () => void,
) {
  const prepared = reservationEditPreparationSchema.parse(input);
  assertReservationScope(context, prepared.principal, prepared);
  const result = bindPreparedReservationEdit(prepared.draft, response);
  if (await storage.read(context, prepared.principal, assertCurrent))
    throw new Error('Resolve the original reservation attempt first');
  const record = preparedReservationRecord(prepared, result.proof, undefined, {
    reservationId: prepared.draft.reservationId,
    timeZone: prepared.draft.timeZone,
  });
  await storage.saveIntent(context, prepared.principal, prepared.draft, assertCurrent);
  await storage.save(context, record, assertCurrent);
  return record;
}
