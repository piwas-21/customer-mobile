import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/apiFailure';
// Source-only additive backend #745 contract; deployed OpenAPI capture remains separate.
const maximumOrderVersion = 2_147_483_647;
const version = z.number().int().min(1).max(maximumOrderVersion);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const cancellationReasonSchema = z.enum([
  'OrderChanged',
  'NotAwaitingCustomerApproval',
  'RestaurantManaged',
  'FinancialReview',
  'OrderingUnavailable',
]);
export const cancellationPreparationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    orderId: canonicalUuidSchema,
    expectedVersion: version,
    allowed: z.boolean(),
    reason: cancellationReasonSchema.nullish().transform((value) => value ?? null),
    payloadHash: digest.nullish().transform((value) => value ?? null),
  })
  .refine((value) =>
    value.allowed
      ? value.reason === null &&
        value.payloadHash !== null &&
        value.expectedVersion < maximumOrderVersion
      : value.reason !== null && value.payloadHash === null,
  );
export const cancellationIntentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  orderId: canonicalUuidSchema,
  expectedVersion: version.max(maximumOrderVersion - 1),
  payloadHash: digest,
});
export const cancellationResolutionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    operationId: canonicalUuidSchema,
    orderId: canonicalUuidSchema,
    outcome: z.enum(['Unseen', 'Cancelled', 'Refused']),
    observedVersion: version.nullish().transform((value) => value ?? null),
    reason: cancellationReasonSchema.nullish().transform((value) => value ?? null),
  })
  .refine((value) => {
    if (value.outcome === 'Unseen') return value.observedVersion === null && value.reason === null;
    return (
      value.observedVersion !== null &&
      (value.outcome === 'Refused' ? value.reason !== null : value.reason === null)
    );
  });
export type CancellationPreparation = z.infer<typeof cancellationPreparationSchema>;
export type CancellationIntent = z.infer<typeof cancellationIntentSchema>;
export type CancellationResolution = z.infer<typeof cancellationResolutionSchema>;
export function bindCancellationResolution(
  intent: CancellationIntent,
  result: CancellationResolution,
  phase: 'submit' | 'recover',
): CancellationResolution {
  const captured = cancellationIntentSchema.parse(intent);
  const resolution = cancellationResolutionSchema.parse(result);
  if (
    resolution.operationId !== captured.operationId ||
    resolution.orderId !== captured.orderId ||
    (phase === 'submit' && resolution.outcome === 'Unseen') ||
    (resolution.outcome === 'Cancelled' &&
      (resolution.observedVersion === null ||
        resolution.observedVersion <= captured.expectedVersion))
  )
    throw new ApiFailure(200, 'contract');
  return resolution;
}
