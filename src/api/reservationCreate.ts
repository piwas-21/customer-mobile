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
import { reservationCreatePath } from '../core/reservationRequest';
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
  phase: 'create' | 'recover' | 'cancel-attempt',
  assertCurrent: () => void,
  locale: string,
  draft?: ReservationDraft,
) {
  const record = scopedReservationRecord(context, input.principal, input);
  if (record.resolution) throw new ApiFailure(409, 'refused');
  if (phase === 'create' && !draft) throw new ApiFailure(409, 'refused');
  assertCurrent();
  const suffix = phase === 'create' ? '' : '/' + phase;
  const body =
    phase === 'create'
      ? { ...draft, payloadHash: record.proof.payloadHash, ownerProof: record.proof.ownerProof }
      : record.proof;
  const result = await client.request(
    context,
    reservationCreatePath + suffix,
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
  return bindReservationResolution(record.proof, result, phase);
}
