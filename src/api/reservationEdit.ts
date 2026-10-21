import {
  bindPreparedReservationEdit,
  reservationEditPreparedSchema,
} from './reservationEditContract';
import {
  reservationEditPreparationSchema,
  type ReservationEditPreparation,
} from '../core/reservationEditPreparation';
import { assertReservationScope } from '../core/reservationOperationRecord';
import { reservationEditPath } from '../core/reservationPaths';
import type { TenantContext } from '../core/tenantContext';
import type { CustomerTransport } from '../core/transport';
export async function prepareReservationEdit(
  client: CustomerTransport,
  context: TenantContext,
  input: ReservationEditPreparation,
  assertCurrent: () => void,
  locale: string,
) {
  const prepared = reservationEditPreparationSchema.parse(input);
  assertReservationScope(context, prepared.principal, prepared);
  assertCurrent();
  const result = await client.request(
    context,
    reservationEditPath + '/prepare',
    reservationEditPreparedSchema,
    {
      method: 'POST',
      credentials: 'reservation-prepare',
      principal: prepared.principal,
      expectedReservationPreparation: prepared,
      body: prepared.draft,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  return bindPreparedReservationEdit(prepared.draft, result);
}
