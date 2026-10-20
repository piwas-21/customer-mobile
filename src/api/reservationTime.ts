import { z } from 'zod';

// System.Text.Json TimeSpan wire format, including legacy day/negative values.
const pattern = /^(-)?(?:(\d{1,8})\.)?([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,7}))?$/;
export const reservationTimeSchema = z.string().regex(pattern);

export function compareReservationTimes(left: string, right: string): number {
  const parts = (value: string) => {
    const match = pattern.exec(value);
    if (!match) throw new Error('Invalid reservation time');
    const seconds =
      Number(match[2] ?? '0') * 86400 +
      Number(match[3]) * 3600 +
      Number(match[4]) * 60 +
      Number(match[5]);
    const fraction = (match[6] ?? '').padEnd(7, '0');
    return {
      sign: match[1] && (seconds !== 0 || fraction !== '0000000') ? -1 : 1,
      seconds,
      fraction,
    };
  };
  const a = parts(left);
  const b = parts(right);
  if (a.sign !== b.sign) return a.sign - b.sign;
  let comparison = a.seconds - b.seconds;
  if (comparison === 0 && a.fraction !== b.fraction) comparison = a.fraction < b.fraction ? -1 : 1;
  return comparison * a.sign;
}
