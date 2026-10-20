import { reservationDay, reservationHour, reservationStatusKey } from './reservationPresentation';

it('keeps calendar dates and wall times unchanged across DST days and device zones', () => {
  expect(reservationDay('2026-11-01', 'en-US')).toBe('Nov 1, 2026');
  expect(reservationDay('2026-03-08', 'en-US')).toBe('Mar 8, 2026');
  expect(reservationHour('18:30:00.1234567', 'en-US')?.replace(/\u202f/g, ' ')).toBe('6:30 PM');
  expect(reservationHour('1.01:00:00', 'en-US')).toBeNull();
  expect(reservationHour('-00:30:00', 'en-US')).toBeNull();
});
it('labels each known status and fails closed on new or oddly cased values', () => {
  expect(
    ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'NoShow'].map(reservationStatusKey),
  ).toEqual([
    'reservationPending',
    'reservationConfirmed',
    'reservationCancelled',
    'reservationCompleted',
    'reservationNoShow',
  ]);
  expect(reservationStatusKey('confirmed')).toBe('reservationStatusUnknown');
  expect(reservationStatusKey('FutureStatus')).toBe('reservationStatusUnknown');
});
