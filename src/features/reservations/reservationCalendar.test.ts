import {
  reservationPickerDay,
  reservationPickerValue,
  reservationToday,
} from './reservationCalendar';
it('derives today on the restaurant clock even across UTC midnight and the repeated DST hour', () => {
  expect(reservationToday('America/Los_Angeles', Date.parse('2026-11-02T02:30:00Z'))).toBe(
    '2026-11-01',
  );
  expect(reservationToday('Pacific/Kiritimati', Date.parse('2026-11-01T12:30:00Z'))).toBe(
    '2026-11-02',
  );
  for (const hour of ['08', '09'])
    expect(
      reservationToday('America/Los_Angeles', Date.parse('2026-11-01T' + hour + ':30:00Z')),
    ).toBe('2026-11-01');
});
it('uses an explicit UTC native calendar marker and returns the same day independently of the device zone', () => {
  const value = reservationPickerValue('2026-11-01');
  expect(value.toISOString()).toBe('2026-11-01T12:00:00.000Z');
  expect(reservationPickerDay(value)).toBe('2026-11-01');
  expect(() => reservationPickerValue('2026-02-30')).toThrow();
  expect(() => reservationPickerDay(new Date('invalid'))).toThrow();
});
