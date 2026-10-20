import { z } from 'zod';

// Keep the original wire precision. A JS Date would discard database microseconds.
export const utcSortMarkerSchema = z.iso
  .datetime()
  .refine((value) => (value.split('.')[1]?.replace('Z', '').length ?? 0) <= 7);

export function normalizedUtcSortMarker(value: string): string {
  return value.replace(
    /(?:\.(\d+))?Z$/,
    (_match: string, fraction: string | undefined) => '.' + (fraction ?? '').padEnd(7, '0') + 'Z',
  );
}
