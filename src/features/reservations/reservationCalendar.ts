import { z } from 'zod';
export function reservationToday(zone: string, now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return z.iso.date().parse(`${value('year')}-${value('month')}-${value('day')}`);
}
export function reservationPickerValue(day: string): Date {
  return new Date(z.iso.date().parse(day) + 'T12:00:00Z');
}
export function reservationPickerDay(value: Date): string {
  return z.iso.date().parse(value.toISOString().slice(0, 10));
}
