import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { tablePaymentStateSchema } from './tablePaymentAccountContract';
import type { TablePaymentIntent } from './tablePaymentIntent';
import { ApiFailure } from '../core/apiFailure';
const identity = {
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  serviceSessionId: canonicalUuidSchema,
};
export const tablePaymentResolutionSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    ...identity,
    outcome: z.literal('Applied'),
    attemptId: canonicalUuidSchema,
    state: tablePaymentStateSchema,
  }),
  z.strictObject({
    ...identity,
    outcome: z.literal('Unseen'),
    attemptId: z.null(),
    state: z.null(),
  }),
  z.strictObject({
    ...identity,
    outcome: z.literal('Stopped'),
    attemptId: z.null(),
    state: z.null(),
  }),
]);
export type TablePaymentResolution = z.infer<typeof tablePaymentResolutionSchema>;
export function bindTablePaymentResolution(
  intent: TablePaymentIntent,
  value: unknown,
  phase: 'submit' | 'recover' | 'stop',
) {
  const result = tablePaymentResolutionSchema.parse(value);
  if (
    result.operationId !== intent.operationId ||
    result.serviceSessionId !== intent.serviceSessionId ||
    (phase !== 'recover' && result.outcome === 'Unseen')
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
