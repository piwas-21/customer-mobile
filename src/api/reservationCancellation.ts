import {
  reservationCancellationPreparedSchema,
  bindPreparedReservationCancellation,
} from './reservationCancellationContract';
import {
  reservationCancellationPreparationSchema,
  type ReservationCancellationPreparation,
} from '../core/reservationCancellationPreparation';
import { assertReservationScope } from '../core/reservationOperationRecord';
import { reservationCancellationPath } from '../core/reservationPaths';
import type { TenantContext } from '../core/tenantContext';
import type { CustomerTransport } from '../core/transport';
export async function prepareReservationCancellation(
  client: CustomerTransport,
  context: TenantContext,
  input: ReservationCancellationPreparation,
  assertCurrent: () => void,
  locale: string,
) {
  const prepared = reservationCancellationPreparationSchema.parse(input);
  assertReservationScope(context, prepared.principal, prepared);
  assertCurrent();
  const response = await client.request(
    context,
    reservationCancellationPath + '/prepare',
    reservationCancellationPreparedSchema,
    {
      method: 'POST',
      credentials: 'reservation-prepare',
      principal: prepared.principal,
      expectedReservationPreparation: prepared,
      body: prepared.request,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  return bindPreparedReservationCancellation(prepared.request, response);
}
