import { reservationEditInputSchema } from '../api/reservationEditContract';
import { bootstrapSchema } from './capabilities';
import { z } from 'zod';
import {
  reservationCreateProofSchema,
  type ReservationCreateProof,
  type ReservationBookingInput,
  reservationCreateResolutionSchema,
  reservationDraftSchema,
} from '../api/reservationCreateContract';
import { principalSchema, type Principal } from './credentials';
import { environmentSchema } from './directory';
import { canonicalUuidSchema } from './identifiers';
import type { TenantContext } from './tenantContext';
import { ApiFailure } from './apiFailure';
export const reservationScopeSchema = z.strictObject({
  environment: environmentSchema,
  tenantId: canonicalUuidSchema,
  principal: principalSchema,
  sessionId: canonicalUuidSchema,
});
export const reservationPreparationSchema = reservationScopeSchema
  .extend({ draft: reservationDraftSchema })
  .refine((record) => record.draft.tenantId === record.tenantId);
export type ReservationPreparation = z.infer<typeof reservationPreparationSchema>;
const ownedReservationActionSchema = z.strictObject({
  reservationId: canonicalUuidSchema,
  timeZone: bootstrapSchema.shape.timezone,
  retryBlocked: z.literal(true).optional(),
});
export const reservationOperationRecordSchema = reservationScopeSchema
  .extend({
    schemaVersion: z.literal(1),
    cancellation: ownedReservationActionSchema.optional(),
    edit: ownedReservationActionSchema.optional(),
    proof: reservationCreateProofSchema,
    cancellationRequested: z.boolean(),
    resolution: reservationCreateResolutionSchema.nullable(),
  })
  .refine(
    (record) =>
      !(record.cancellation && record.edit) &&
      (!(record.cancellation || record.edit) || record.principal.kind === 'customer') &&
      record.tenantId === record.proof.tenantId &&
      (record.resolution === null ||
        (record.resolution.outcome !== 'Unseen' &&
          record.resolution.operationId === record.proof.operationId &&
          (!(record.cancellation || record.edit) ||
            record.resolution.outcome !== 'Applied' ||
            record.resolution.reservationId ===
              (record.cancellation ?? record.edit)?.reservationId))),
  );
export type ReservationOperationRecord = z.infer<typeof reservationOperationRecordSchema>;
export const reservationContactSchema = z
  .strictObject({
    operationId: canonicalUuidSchema,
    draft: z.union([reservationDraftSchema, reservationEditInputSchema]),
  })
  .refine((record) => record.operationId === record.draft.operationId);
export function assertReservationScope(
  context: TenantContext,
  principal: Principal,
  record: z.infer<typeof reservationScopeSchema>,
) {
  if (
    context.signal.aborted ||
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id ||
    record.principal.kind !== principal.kind ||
    record.principal.id !== principal.id
  )
    throw new ApiFailure(401, 'refused');
}
export function scopedReservationRecord(
  context: TenantContext,
  principal: Principal,
  input: unknown,
) {
  const record = reservationOperationRecordSchema.parse(input);
  assertReservationScope(context, principalSchema.parse(principal), record);
  return record;
}

export function createReservationPreparation(
  context: TenantContext,
  principal: Principal,
  input: ReservationBookingInput,
  createId: () => string,
): ReservationPreparation {
  const draft = reservationDraftSchema.parse({
    ...input,
    schemaVersion: 1,
    operationId: createId(),
    tenantId: context.tenant.id,
  });
  return reservationPreparationSchema.parse({
    environment: context.environment,
    tenantId: context.tenant.id,
    principal,
    sessionId: createId(),
    draft,
  });
}

export function preparedReservationRecord(
  scope: z.infer<typeof reservationScopeSchema>,
  proof: ReservationCreateProof,
  cancellation?: ReservationOperationRecord['cancellation'],
  edit?: ReservationOperationRecord['edit'],
): ReservationOperationRecord {
  return reservationOperationRecordSchema.parse({
    schemaVersion: 1,
    environment: scope.environment,
    tenantId: scope.tenantId,
    principal: scope.principal,
    sessionId: scope.sessionId,
    proof,
    cancellationRequested: false,
    resolution: null,
    ...(cancellation ? { cancellation } : {}),
    ...(edit ? { edit } : {}),
  });
}
