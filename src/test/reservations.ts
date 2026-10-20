import type { ReservationItem, ReservationCursor } from '../api/reservations';
import { addressId } from './savedAddresses';

export function reservationItem(index = 1, patch: Partial<ReservationItem> = {}): ReservationItem {
  return {
    reservationId: addressId(index),
    reservationDate: '2026-11-01',
    startTime: '18:30:00',
    endTime: '20:00:00',
    numberOfGuests: 2,
    status: 'Pending',
    specialRequests: null,
    ...patch,
  };
}
export const reservationPage = (
  items = [reservationItem()],
  next: ReservationCursor | null = null,
) => ({
  schemaVersion: 1,
  timeZone: 'America/Los_Angeles',
  items,
  next,
});
