import { z } from 'zod';
import { originSchema } from './directory';
const originsSchema = z.array(originSchema).max(10);
export function hostedCheckoutOrigins(value: string | undefined): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  const origins = originsSchema.parse(JSON.parse(value));
  if (new Set(origins).size !== origins.length) throw new Error('Duplicate hosted origin');
  return Object.freeze(origins);
}
