import { z } from 'zod';
import { credentialSecretSchema } from './credentials';
import {
  reservationDraftSchema,
  reservationCreateProofSchema,
} from '../api/reservationCreateContract';
import {
  assertReservationScope,
  reservationContactSchema,
  scopedReservationRecord,
} from './reservationOperationRecord';
import { ApiFailure } from './apiFailure';
import type { CredentialVault, Principal } from './credentials';
import type { RequestOptions } from './httpTypes';
import type { TenantContext } from './tenantContext';
import {
  captureReservationPreparation,
  anyReservationPreparationSchema,
} from './reservationPreparationRequest';
import { reservationOperationPath } from './reservationPaths';
export { reservationCreatePath } from './reservationPaths';
const renewalBodySchema = z.strictObject({
  accessToken: credentialSecretSchema,
  refreshToken: credentialSecretSchema,
});
const fullBodySchema = reservationDraftSchema.safeExtend({
  payloadHash: reservationCreateProofSchema.shape.payloadHash,
  ownerProof: reservationCreateProofSchema.shape.ownerProof,
});
// Capture immutable authority/body before secure reads or UI lifecycle events can yield.
export function captureReservationRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  const mode = options.credentials;
  if (
    mode !== 'reservation-prepare' &&
    mode !== 'reservation-operation' &&
    mode !== 'reservation-renewal'
  ) {
    if (
      options.expectedReservationPreparation !== undefined ||
      options.expectedReservationRecord !== undefined
    )
      throw new ApiFailure(401, 'refused');
    return options;
  }
  if (options.method !== 'POST' || !options.principal || !options.assertCurrent)
    throw new ApiFailure(401, 'refused');
  if (mode === 'reservation-prepare') return captureReservationPreparation(context, path, options);
  if (mode === 'reservation-renewal') {
    const record = scopedReservationRecord(
      context,
      options.principal,
      options.expectedReservationRecord,
    );
    if (
      path !== '/api/Auth/refresh-token' ||
      record.principal.kind !== 'customer' ||
      record.resolution ||
      options.expectedReservationPreparation !== undefined
    )
      throw new ApiFailure(401, 'refused');
    return {
      ...options,
      principal: record.principal,
      expectedReservationRecord: record,
      body: renewalBodySchema.parse(options.body),
    };
  }
  return captureOperation(context, path, options, options.principal);
}
function captureOperation(
  context: TenantContext,
  path: string,
  options: RequestOptions,
  principal: Principal,
): RequestOptions {
  if (options.expectedReservationPreparation !== undefined) throw new ApiFailure(401, 'refused');
  const record = scopedReservationRecord(context, principal, options.expectedReservationRecord);
  const base = reservationOperationPath(record.cancellation !== undefined);
  const apply = base + (record.cancellation ? '/submit' : '');
  if (record.resolution || ![apply, base + '/recover', base + '/cancel-attempt'].includes(path))
    throw new ApiFailure(401, 'refused');
  const create = !record.cancellation && path === apply;
  if (path === apply && (record.cancellationRequested || record.cancellation?.retryBlocked))
    throw new ApiFailure(401, 'refused');
  if (
    (create && record.cancellationRequested) ||
    (path.endsWith('/cancel-attempt') && !record.cancellationRequested)
  )
    throw new ApiFailure(401, 'refused');
  const body = create
    ? fullBodySchema.parse(options.body)
    : reservationCreateProofSchema.parse(options.body);
  if (
    body.operationId !== record.proof.operationId ||
    body.tenantId !== record.tenantId ||
    body.payloadHash !== record.proof.payloadHash ||
    body.ownerProof !== record.proof.ownerProof
  )
    throw new ApiFailure(401, 'refused');
  return { ...options, principal: record.principal, expectedReservationRecord: record, body };
}
export async function reservationRequestHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  const principal = options.principal;
  if (!principal || !options.assertCurrent) throw new ApiFailure(401, 'refused');
  let sessionId: string;
  if (options.credentials === 'reservation-prepare') {
    const prepared = anyReservationPreparationSchema.parse(options.expectedReservationPreparation);
    assertReservationScope(context, principal, prepared);
    sessionId = prepared.sessionId;
  } else {
    sessionId = await originalReservationSession(context, vault, principal, options);
  }
  const headers: Record<string, string> = { 'X-Session-Id': sessionId };
  if (principal.kind === 'customer') {
    const session = await vault.session(context, principal.id);
    if (!session) throw new ApiFailure(401, 'refused');
    if (options.credentials === 'reservation-renewal') {
      const body = renewalBodySchema.parse(options.body);
      if (body.accessToken !== session.accessToken || body.refreshToken !== session.refreshToken)
        throw new ApiFailure(401, 'refused');
    } else headers.Authorization = `Bearer ${session.accessToken}`;
  }
  options.assertCurrent();
  return headers;
}

async function originalReservationSession(
  context: TenantContext,
  vault: CredentialVault,
  principal: Principal,
  options: RequestOptions,
) {
  const expected = scopedReservationRecord(context, principal, options.expectedReservationRecord);
  const raw = await vault.capability(context, 'reservation-operation', principal);
  if (raw === null) throw new ApiFailure(401, 'refused');
  const saved = scopedReservationRecord(context, principal, JSON.parse(raw));
  if (saved.resolution || JSON.stringify(saved) !== JSON.stringify(expected))
    throw new ApiFailure(401, 'refused');
  if (fullBodySchema.safeParse(options.body).success) {
    const contactRaw = await vault.reservationContactRecord(context, principal);
    if (contactRaw === null || saved.cancellationRequested) throw new ApiFailure(401, 'refused');
    const contact = reservationContactSchema.parse(JSON.parse(contactRaw));
    const wire = fullBodySchema.parse({
      ...contact.draft,
      payloadHash: saved.proof.payloadHash,
      ownerProof: saved.proof.ownerProof,
    });
    if (
      contact.operationId !== saved.proof.operationId ||
      JSON.stringify(wire) !== JSON.stringify(options.body)
    )
      throw new ApiFailure(401, 'refused');
  }
  return saved.sessionId;
}
