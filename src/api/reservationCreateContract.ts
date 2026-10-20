import { z } from 'zod';
import { bootstrapSchema } from '../core/capabilities';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/transport';
import { availabilityInputSchema, reservationSlotSchema } from './reservationAvailability';

// Full contact input is private intent; it never belongs in a minimal recovery proof.
export const reservationDraftSchema = availabilityInputSchema
  .extend({
    schemaVersion: z.literal(1),
    operationId: canonicalUuidSchema,
    tenantId: canonicalUuidSchema,
    timeZone: bootstrapSchema.shape.timezone,
    ...reservationSlotSchema.shape,
    customerName: z
      .string()
      .max(100)
      .refine((name) => name.trim().length > 0),
    customerEmail: z.email().max(255),
    customerPhone: z.string().max(20).nullable(),
    specialRequests: z.string().max(1000).nullable(),
  })
  .refine((draft) => reservationSlotSchema.safeParse(draftSlot(draft)).success);
function draftSlot(draft: { startTime: string; endTime: string }) {
  return { startTime: draft.startTime, endTime: draft.endTime };
}
export type ReservationDraft = z.infer<typeof reservationDraftSchema>;
export const reservationCreateProofSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  tenantId: canonicalUuidSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  ownerProof: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
export type ReservationCreateProof = z.infer<typeof reservationCreateProofSchema>;
const resolutionScope = { schemaVersion: z.literal(1), operationId: canonicalUuidSchema };
export const reservationCreateResolutionSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    ...resolutionScope,
    outcome: z.literal('Applied'),
    reservationId: canonicalUuidSchema,
  }),
  z.strictObject({ ...resolutionScope, outcome: z.literal('Cancelled'), reservationId: z.null() }),
  z.strictObject({ ...resolutionScope, outcome: z.literal('Unseen'), reservationId: z.null() }),
]);
export type ReservationCreateResolution = z.infer<typeof reservationCreateResolutionSchema>;
export function bindPreparedReservation(draft: ReservationDraft, input: unknown) {
  const request = reservationDraftSchema.parse(draft);
  const proof = reservationCreateProofSchema.parse(input);
  if (proof.operationId !== request.operationId || proof.tenantId !== request.tenantId)
    throw new ApiFailure(200, 'contract');
  return proof;
}
export function bindReservationResolution(
  proof: ReservationCreateProof,
  input: unknown,
  phase: 'create' | 'recover' | 'cancel-attempt',
) {
  const original = reservationCreateProofSchema.parse(proof);
  const result = reservationCreateResolutionSchema.parse(input);
  if (
    result.operationId !== original.operationId ||
    (phase !== 'recover' && result.outcome === 'Unseen')
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
