import {
  bindPreparedReservation,
  bindReservationResolution,
  reservationCreateProofSchema,
  reservationCreateResolutionSchema,
  type ReservationDraft,
} from './reservationCreateContract';
import {
  assertReservationScope,
  reservationPreparationSchema,
  scopedReservationRecord,
  type ReservationOperationRecord,
  type ReservationPreparation,
} from '../core/reservationOperationRecord';
import { reservationCreatePath, reservationOperationPath } from '../core/reservationPaths';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
export async function prepareReservation(
  client: CustomerTransport,
  context: TenantContext,
  input: ReservationPreparation,
  assertCurrent: () => void,
  locale: string,
) {
  const prepared = reservationPreparationSchema.parse(input);
  assertReservationScope(context, prepared.principal, prepared);
  assertCurrent();
  const proof = await client.request(
    context,
    reservationCreatePath + '/prepare',
    reservationCreateProofSchema,
    {
      method: 'POST',
      credentials: 'reservation-prepare',
      principal: prepared.principal,
      expectedReservationPreparation: prepared,
      body: prepared.draft,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  return bindPreparedReservation(prepared.draft, proof);
}
export async function resolveReservationAttempt(
  client: CustomerTransport,
  context: TenantContext,
  input: ReservationOperationRecord,
  phase: 'create' | 'submit' | 'recover' | 'cancel-attempt',
  assertCurrent: () => void,
  locale: string,
  draft?: ReservationDraft,
) {
  const record = scopedReservationRecord(context, input.principal, input);
  assertAttemptPhase(record, phase, draft);
  assertCurrent();
  const suffix = phase === 'create' ? '' : '/' + phase;
  const body =
    phase === 'create' || (record.edit && phase === 'submit')
      ? { ...draft, payloadHash: record.proof.payloadHash, ownerProof: record.proof.ownerProof }
      : record.proof;
  const result = await client.request(
    context,
    reservationOperationPath(record.cancellation !== undefined, record.edit !== undefined) + suffix,
    reservationCreateResolutionSchema,
    {
      method: 'POST',
      credentials: 'reservation-operation',
      principal: record.principal,
      expectedReservationRecord: record,
      body,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  const bound = bindReservationResolution(
    record.proof,
    result,
    phase === 'submit' ? 'create' : phase,
  );
  if (
    (record.cancellation || record.edit) &&
    bound.outcome === 'Applied' &&
    bound.reservationId !== (record.cancellation ?? record.edit)?.reservationId
  )
    throw new ApiFailure(200, 'contract');
  return bound;
}

function assertAttemptPhase(
  record: ReservationOperationRecord,
  phase: 'create' | 'submit' | 'recover' | 'cancel-attempt',
  draft: ReservationDraft | undefined,
) {
  if (record.resolution) throw new ApiFailure(409, 'refused');
  if (phase === 'submit') assertSubmissionPhase(record, draft);
  if (phase === 'create' && (record.cancellation || record.edit || !draft))
    throw new ApiFailure(409, 'refused');
  if (record.cancellation && draft !== undefined) throw new ApiFailure(409, 'refused');
}

function assertSubmissionPhase(
  record: ReservationOperationRecord,
  draft: ReservationDraft | undefined,
) {
  const owned = record.cancellation ?? record.edit;
  if (record.cancellationRequested || owned?.retryBlocked || !owned || (record.edit && !draft))
    throw new ApiFailure(409, 'refused');
}
