import { z } from 'zod';
import { bootstrapSchema } from '../core/capabilities';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/apiFailure';
import { availabilityInputSchema, reservationSlotSchema } from './reservationAvailability';

export const reservationContactLimits = {
  customerName: 100,
  customerEmail: 255,
  customerPhone: 20,
  specialRequests: 1000,
} as const;
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
      .max(reservationContactLimits.customerName)
      .refine((name) => name.trim().length > 0),
    customerEmail: z.email().max(reservationContactLimits.customerEmail),
    customerPhone: z.string().max(reservationContactLimits.customerPhone).nullable(),
    specialRequests: z.string().max(reservationContactLimits.specialRequests).nullable(),
  })
  .refine(validSlot);
function validSlot(draft: { startTime: string; endTime: string }) {
  return reservationSlotSchema.safeParse({ startTime: draft.startTime, endTime: draft.endTime })
    .success;
}
export const reservationBookingInputSchema = z
  .strictObject(reservationDraftSchema.shape)
  .omit({ schemaVersion: true, operationId: true, tenantId: true })
  .refine(validSlot);
export type ReservationBookingInput = z.infer<typeof reservationBookingInputSchema>;
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
