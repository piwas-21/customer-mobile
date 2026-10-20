import { z } from 'zod';
import { ApiFailure } from './apiFailure';
import { scopedCancellationRecord } from './cancellationOperationRecord';
import type { CancellationOperationRecord } from './cancellationOperationRecord';
import type { CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
import type { TenantContext } from './tenantContext';
import { cancellationIntentSchema } from '../api/orderCancellationContract';

export function cancellationBody(record: CancellationOperationRecord) {
  if (record.authority.kind === 'customer') return record.intent;
  const proof = record.authority.proof;
  return {
    proof: { schemaVersion: 1, operationId: proof.operationId, payloadHash: proof.payloadHash },
    intent: record.intent,
  };
}
const renewalBody = z.strictObject({ accessToken: z.string(), refreshToken: z.string() });
const originalBody = z.strictObject({
  proof: z.strictObject({
    schemaVersion: z.literal(1),
    operationId: z.uuid(),
    payloadHash: z.string(),
  }),
  intent: cancellationIntentSchema,
});

// Capture both the operation authority and its wire payload before secure reads can yield.
export function captureCancellationRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  const mode = options.credentials;
  if (mode !== 'order-cancellation' && mode !== 'cancellation-renewal') {
    if (options.expectedCancellationRecord !== undefined) throw new ApiFailure(401, 'refused');
    return options;
  }
  if (!options.principal || !options.assertCurrent || options.method !== 'POST')
    throw new ApiFailure(401, 'refused');
  const record = scopedCancellationRecord(
    context,
    options.principal,
    options.expectedCancellationRecord,
  );
  if (record.resolution !== null) throw new ApiFailure(401, 'refused');
  const capturedBody =
    mode === 'cancellation-renewal'
      ? captureRenewalBody(record, path, options.body)
      : captureActionBody(record, path, options.body);
  return {
    ...options,
    body: capturedBody,
    principal: record.principal,
    expectedCancellationRecord: record,
  };
}

function captureRenewalBody(record: CancellationOperationRecord, path: string, body: unknown) {
  if (path !== '/api/Auth/refresh-token' || record.principal.kind !== 'customer')
    throw new ApiFailure(401, 'refused');
  return renewalBody.parse(body);
}
function captureActionBody(record: CancellationOperationRecord, path: string, input: unknown) {
  const prefix = '/api/customer-mobile/orders/cancellation/';
  const scope = record.authority.kind === 'original' ? 'original/' : '';
  if (path !== `${prefix}${scope}submit` && path !== `${prefix}${scope}recover`)
    throw new ApiFailure(401, 'refused');
  const body =
    record.authority.kind === 'original'
      ? originalBody.parse(input)
      : cancellationIntentSchema.parse(input);
  if (JSON.stringify(body) !== JSON.stringify(cancellationBody(record)))
    throw new ApiFailure(401, 'refused');
  return body;
}

export async function cancellationRequestHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  if (
    options.credentials !== 'order-cancellation' &&
    options.credentials !== 'cancellation-renewal'
  )
    return {};
  const principal = options.principal;
  if (!principal) throw new ApiFailure(401, 'refused');
  const expected = scopedCancellationRecord(context, principal, options.expectedCancellationRecord);
  const raw = await vault.capability(context, 'order-cancellation', principal);
  if (raw === null) throw new ApiFailure(401, 'refused');
  const saved = scopedCancellationRecord(context, principal, JSON.parse(raw));
  if (saved.resolution !== null || JSON.stringify(saved) !== JSON.stringify(expected))
    throw new ApiFailure(401, 'refused');
  const headers: Record<string, string> = {};
  if (principal.kind === 'customer') {
    const session = await vault.session(context, principal.id);
    if (!session) throw new ApiFailure(401, 'refused');
    if (options.credentials === 'cancellation-renewal') {
      const body = renewalBody.parse(options.body);
      if (body.accessToken !== session.accessToken || body.refreshToken !== session.refreshToken)
        throw new ApiFailure(401, 'refused');
    } else headers.Authorization = `Bearer ${session.accessToken}`;
  }
  if (saved.authority.kind === 'original')
    headers['X-Session-Id'] = saved.authority.proof.sessionId;
  return headers;
}
