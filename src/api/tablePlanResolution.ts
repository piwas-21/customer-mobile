import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/apiFailure';
import type { TablePlanIntent } from './tablePlanIntent';
// Schema1 outcomes mirror CustomerTablePlanResolutionDto: no echoed tenant or owner.
// Tenant/environment/principal authority stays in the original proof and scoped transport.
const identity = {
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  serviceSessionId: canonicalUuidSchema,
};
export const tablePlanResolutionSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...identity, outcome: z.literal('unseen'), planId: z.null() }),
  z.strictObject({ ...identity, outcome: z.literal('stopped'), planId: z.null() }),
  z.strictObject({ ...identity, outcome: z.literal('applied'), planId: canonicalUuidSchema }),
]);
export type TablePlanResolution = z.infer<typeof tablePlanResolutionSchema>;
/** Call after the scoped request has verified its immutable context and original proof. */
export function bindTablePlanResolution(
  intent: Pick<TablePlanIntent, 'operationId' | 'serviceSessionId'>,
  value: unknown,
  action: 'submit' | 'recover' | 'stop',
) {
  const result = tablePlanResolutionSchema.parse(value);
  if (
    result.operationId !== intent.operationId ||
    result.serviceSessionId !== intent.serviceSessionId ||
    (action !== 'recover' && result.outcome === 'unseen')
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
