import { z } from 'zod';
import { bootstrapSchema } from '../core/capabilities';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/apiFailure';
import { reservationCreateProofSchema } from './reservationCreateContract';
import { reservationItemSchema } from './reservations';
export const reservationCancellationInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  tenantId: canonicalUuidSchema,
  reservationId: canonicalUuidSchema,
  timeZone: bootstrapSchema.shape.timezone,
});
export type ReservationCancellationInput = z.infer<typeof reservationCancellationInputSchema>;
export const reservationCancellationPreparedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  proof: reservationCreateProofSchema,
  reservation: reservationItemSchema.extend({ status: z.enum(['Pending', 'Confirmed']) }),
  timeZone: bootstrapSchema.shape.timezone,
});
export function bindPreparedReservationCancellation(
  input: ReservationCancellationInput,
  value: unknown,
) {
  const request = reservationCancellationInputSchema.parse(input);
  const prepared = reservationCancellationPreparedSchema.parse(value);
  if (
    prepared.proof.operationId !== request.operationId ||
    prepared.proof.tenantId !== request.tenantId ||
    prepared.reservation.reservationId !== request.reservationId ||
    prepared.timeZone !== request.timeZone
  )
    throw new ApiFailure(200, 'contract');
  return prepared;
}
