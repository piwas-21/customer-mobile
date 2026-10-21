import { z } from 'zod';
import { bootstrapSchema } from '../core/capabilities';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/apiFailure';
import type { SessionController } from '../core/sessionController';
import { availabilityInputSchema, reservationAvailabilitySchema } from './reservationAvailability';
import { reservationItemSchema } from './reservations';
import { reservationContactLimits } from './reservationCreateContract';

export const reservationEditScopeSchema = z.strictObject({
  tenantId: canonicalUuidSchema,
  reservationId: canonicalUuidSchema,
  timeZone: bootstrapSchema.shape.timezone,
});
export type ReservationEditScope = z.infer<typeof reservationEditScopeSchema>;
export const reservationEditContextSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tenantId: canonicalUuidSchema,
  timeZone: bootstrapSchema.shape.timezone,
  reservation: reservationItemSchema.extend({ status: z.enum(['Pending', 'Confirmed']) }),
  // Existing private contact may need correction; reading it grants no write authority.
  contact: z.strictObject({
    customerName: z.string().max(reservationContactLimits.customerName),
    customerEmail: z.string().max(reservationContactLimits.customerEmail),
    customerPhone: z.string().max(reservationContactLimits.customerPhone).nullable(),
  }),
});
export type ReservationEditContext = z.infer<typeof reservationEditContextSchema>;
export const reservationEditAvailabilitySchema = reservationAvailabilitySchema.safeExtend({
  reservationId: canonicalUuidSchema,
});
function editPath(scope: ReservationEditScope) {
  return '/api/customer-mobile/reservations/' + scope.reservationId;
}
export async function readReservationEditContext(
  controller: SessionController,
  userId: string,
  scope: ReservationEditScope,
) {
  const original = reservationEditScopeSchema.parse(scope);
  const result = await controller.get(
    userId,
    editPath(original) + '/edit?schemaVersion=1',
    reservationEditContextSchema,
  );
  if (
    result.tenantId !== original.tenantId ||
    result.reservation.reservationId !== original.reservationId ||
    result.timeZone !== original.timeZone
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
export async function readReservationEditAvailability(
  controller: SessionController,
  userId: string,
  scope: ReservationEditScope,
  input: z.infer<typeof availabilityInputSchema>,
) {
  const original = reservationEditScopeSchema.parse(scope);
  const request = availabilityInputSchema.parse(input);
  const result = await controller.get(
    userId,
    editPath(original) +
      '/availability?schemaVersion=1&date=' +
      request.date +
      '&numberOfGuests=' +
      request.numberOfGuests +
      '&timeZone=' +
      encodeURIComponent(original.timeZone),
    reservationEditAvailabilitySchema,
  );
  if (
    result.reservationId !== original.reservationId ||
    result.timeZone !== original.timeZone ||
    result.date !== request.date ||
    result.numberOfGuests !== request.numberOfGuests
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
