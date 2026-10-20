import { z } from 'zod';
import { bootstrapSchema } from '../core/capabilities';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import { compareReservationTimes } from './reservationTime';

// Matches the backend ReservationWriteDto party-size contract.
export const reservationPartyBounds = { minimum: 1, maximum: 20 } as const;
const partySizeSchema = z
  .number()
  .int()
  .min(reservationPartyBounds.minimum)
  .max(reservationPartyBounds.maximum);
export const availabilityInputSchema = z.strictObject({
  date: z.iso.date(),
  numberOfGuests: partySizeSchema,
});
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;
const wallTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/);
const slotSchema = z
  .strictObject({
    startTime: wallTime,
    endTime: z.union([wallTime, z.literal('1.00:00:00')]),
  })
  .refine(
    (slot) =>
      compareReservationTimes(slot.startTime, '00:00:00') >= 0 &&
      compareReservationTimes(slot.endTime, '1.00:00:00') <= 0 &&
      compareReservationTimes(slot.endTime, slot.startTime) > 0,
  );
export const reservationAvailabilitySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    date: z.iso.date(),
    timeZone: bootstrapSchema.shape.timezone,
    numberOfGuests: partySizeSchema,
    slots: z.array(slotSchema).max(48),
  })
  .refine((page) =>
    page.slots.every((slot, index) => {
      if (index === 0) return true;
      const previous = page.slots[index - 1]!;
      const start = compareReservationTimes(slot.startTime, previous.startTime);
      return (
        start > 0 || (start === 0 && compareReservationTimes(slot.endTime, previous.endTime) > 0)
      );
    }),
  );
export type ReservationAvailability = z.infer<typeof reservationAvailabilitySchema>;
export async function readReservationAvailability(
  client: CustomerTransport,
  context: TenantContext,
  input: AvailabilityInput,
  zone: string,
) {
  const request = availabilityInputSchema.parse(input);
  const expectedZone = bootstrapSchema.shape.timezone.parse(zone);
  const page = await client.request(
    context,
    '/api/customer-mobile/reservations/availability?schemaVersion=1&date=' +
      request.date +
      '&numberOfGuests=' +
      request.numberOfGuests,
    reservationAvailabilitySchema,
  );
  if (
    page.date !== request.date ||
    page.numberOfGuests !== request.numberOfGuests ||
    page.timeZone !== expectedZone
  )
    throw new ApiFailure(200, 'contract');
  return page;
}
