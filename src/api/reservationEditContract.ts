import { z } from 'zod';
import { bootstrapSchema } from '../core/capabilities';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/apiFailure';
import {
  reservationDraftSchema,
  reservationCreateProofSchema,
  reservationBookingInputSchema,
} from './reservationCreateContract';
import { reservationItemSchema } from './reservations';
import { compareReservationTimes } from './reservationTime';
export const reservationEditInputSchema = reservationDraftSchema.safeExtend({
  reservationId: canonicalUuidSchema,
});
export type ReservationEditInput = z.infer<typeof reservationEditInputSchema>;
export const reservationEditBookingInputSchema = reservationBookingInputSchema.safeExtend({
  reservationId: canonicalUuidSchema,
});
export type ReservationEditBookingInput = z.infer<typeof reservationEditBookingInputSchema>;
const editableReservationSchema = reservationItemSchema.extend({
  status: z.enum(['Pending', 'Confirmed']),
});
export const reservationEditPreparedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  proof: reservationCreateProofSchema,
  original: editableReservationSchema,
  proposed: editableReservationSchema,
  timeZone: bootstrapSchema.shape.timezone,
});
export type ReservationEditPrepared = z.infer<typeof reservationEditPreparedSchema>;
export function bindPreparedReservationEdit(input: ReservationEditInput, value: unknown) {
  const request = reservationEditInputSchema.parse(input);
  const prepared = reservationEditPreparedSchema.parse(value);
  const { original, proposed } = prepared;
  const shapeChanged =
    original.reservationDate !== proposed.reservationDate ||
    compareReservationTimes(original.startTime, proposed.startTime) !== 0 ||
    compareReservationTimes(original.endTime, proposed.endTime) !== 0 ||
    original.numberOfGuests !== proposed.numberOfGuests;
  const expectedStatus = shapeChanged ? 'Pending' : original.status;
  if (
    prepared.proof.operationId !== request.operationId ||
    prepared.proof.tenantId !== request.tenantId ||
    prepared.timeZone !== request.timeZone ||
    original.reservationId !== request.reservationId ||
    proposed.reservationId !== request.reservationId ||
    proposed.reservationDate !== request.date ||
    compareReservationTimes(proposed.startTime, request.startTime) !== 0 ||
    compareReservationTimes(proposed.endTime, request.endTime) !== 0 ||
    proposed.numberOfGuests !== request.numberOfGuests ||
    proposed.specialRequests !== request.specialRequests ||
    proposed.status !== expectedStatus
  )
    throw new ApiFailure(200, 'contract');
  return prepared;
}
