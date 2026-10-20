import { z } from 'zod';
import { bootstrapSchema } from '../core/capabilities';
import { canonicalUuidSchema } from '../core/identifiers';
import type { SessionController } from '../core/sessionController';
import { ApiFailure } from '../core/transport';
import { normalizedUtcSortMarker, utcSortMarkerSchema } from '../core/utcSortMarker';
import { compareReservationTimes, reservationTimeSchema } from './reservationTime';

export const reservationItemSchema = z.strictObject({
  reservationId: canonicalUuidSchema,
  reservationDate: z.iso.date(),
  startTime: reservationTimeSchema,
  endTime: reservationTimeSchema,
  numberOfGuests: z.number().int().positive().max(2147483647),
  status: z.string().min(1).max(64),
  specialRequests: z.string().max(1000).nullable(),
});
const cursorSchema = z.strictObject({
  reservationDate: utcSortMarkerSchema,
  startTime: reservationTimeSchema,
  reservationId: canonicalUuidSchema,
});
export type ReservationItem = z.infer<typeof reservationItemSchema>;
export type ReservationCursor = z.infer<typeof cursorSchema>;

export function reservationCursorFollows(next: ReservationCursor, previous: ReservationCursor) {
  const date = normalizedUtcSortMarker(next.reservationDate);
  const before = normalizedUtcSortMarker(previous.reservationDate);
  const time = compareReservationTimes(next.startTime, previous.startTime);
  return (
    date < before ||
    (date === before && (time > 0 || (time === 0 && next.reservationId > previous.reservationId)))
  );
}
export const reservationHistorySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    timeZone: bootstrapSchema.shape.timezone,
    items: z.array(reservationItemSchema).max(20),
    next: cursorSchema.nullable(),
  })
  .refine((page) => {
    if (new Set(page.items.map((item) => item.reservationId)).size !== page.items.length)
      return false;
    if (
      page.items.some(
        (item, index) => index > 0 && item.reservationDate > page.items[index - 1]!.reservationDate,
      )
    )
      return false;
    if (!page.next) return true;
    const last = page.items.at(-1);
    return (
      page.items.length === 20 &&
      last?.reservationId === page.next.reservationId &&
      last.startTime === page.next.startTime &&
      last.reservationDate === page.next.reservationDate.slice(0, 10)
    );
  });

export async function readReservationHistory(
  controller: SessionController,
  userId: string,
  before?: ReservationCursor,
) {
  const cursor = before === undefined ? undefined : cursorSchema.parse(before);
  const query = cursor
    ? '&beforeDate=' +
      encodeURIComponent(cursor.reservationDate) +
      '&beforeStartTime=' +
      encodeURIComponent(cursor.startTime) +
      '&beforeId=' +
      cursor.reservationId
    : '';
  const page = await controller.get(
    userId,
    '/api/customer-mobile/reservations?schemaVersion=1' + query,
    reservationHistorySchema,
  );
  if (
    cursor &&
    (page.items.some((item) => item.reservationDate > cursor.reservationDate.slice(0, 10)) ||
      (page.next && !reservationCursorFollows(page.next, cursor)))
  )
    throw new ApiFailure(200, 'contract');
  return page;
}
export async function readReservation(
  controller: SessionController,
  userId: string,
  reservationId: string,
) {
  const id = canonicalUuidSchema.parse(reservationId);
  const item = await controller.get(
    userId,
    '/api/customer-mobile/reservations/' + id + '?schemaVersion=1',
    reservationItemSchema,
  );
  if (item.reservationId !== id) throw new ApiFailure(200, 'contract');
  return item;
}
