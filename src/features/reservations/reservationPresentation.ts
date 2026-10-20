const statusKeys = new Map([
  ['Pending', 'reservationPending'],
  ['Confirmed', 'reservationConfirmed'],
  ['Cancelled', 'reservationCancelled'],
  ['Completed', 'reservationCompleted'],
  ['NoShow', 'reservationNoShow'],
]);
export function reservationStatusKey(status: string): string {
  return statusKeys.get(status) ?? 'reservationStatusUnknown';
}
export function reservationDay(day: string, locale: string): string {
  // A booking day is a calendar marker. UTC formatting prevents the device zone changing it.
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(day + 'T12:00:00Z'),
  );
}
export function reservationHour(time: string, locale: string): string | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/.test(time)) return null;
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date('2000-01-01T' + time.slice(0, 8) + 'Z'));
}
