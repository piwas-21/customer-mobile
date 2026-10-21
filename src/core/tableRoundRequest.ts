import { originalOperationProofSchema } from '../api/originalOperationProof';
import { tableRoundIntentSchema } from '../api/tableRoundContract';
import { ApiFailure } from './apiFailure';
import type { RequestOptions } from './httpTypes';
import { scopedRoundPreparation } from './tableRoundPreparation';
import { scopedTableRound } from './tableRoundRecord';
import { refreshCredentialsSchema } from './refreshCredentials';
import type { TenantContext } from './tenantContext';

export const tableRoundPath = '/api/customer-mobile/table-rounds';
const submissionSchema = tableRoundIntentSchema.extend({
  payloadHash: originalOperationProofSchema.shape.payloadHash,
  ownerProof: originalOperationProofSchema.shape.ownerProof,
});
export function isTableRoundRecovery(path: string) {
  return path === tableRoundPath + '/recover' || path === tableRoundPath + '/cancel-attempt';
}
export function captureTableRoundRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  const mode = options.credentials;
  if (
    mode !== 'table-round-prepare' &&
    mode !== 'table-round-operation' &&
    mode !== 'table-round-renewal'
  ) {
    if (options.expectedRoundPreparation !== undefined || options.expectedRoundRecord !== undefined)
      throw new ApiFailure(401, 'refused');
    return options;
  }
  if (options.method !== 'POST' || !options.principal || !options.assertCurrent)
    throw new ApiFailure(401, 'refused');
  if (mode === 'table-round-prepare') {
    const prepared = scopedRoundPreparation(
      context,
      options.principal,
      options.expectedRoundPreparation,
    );
    const body = tableRoundIntentSchema.parse(options.body);
    if (
      path !== tableRoundPath + '/prepare' ||
      options.expectedRoundRecord !== undefined ||
      JSON.stringify(body) !== JSON.stringify(prepared.intent)
    )
      throw new ApiFailure(401, 'refused');
    return { ...options, principal: prepared.principal, expectedRoundPreparation: prepared, body };
  }
  return captureOriginal(context, path, options);
}
function captureOriginal(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  const record = scopedTableRound(context, options.principal!, options.expectedRoundRecord);
  if (record.resolution) throw new ApiFailure(401, 'refused');
  if (options.credentials === 'table-round-renewal') {
    if (
      path !== '/api/Auth/refresh-token' ||
      record.principal.kind !== 'customer' ||
      options.expectedRoundPreparation !== undefined
    )
      throw new ApiFailure(401, 'refused');
    return {
      ...options,
      principal: record.principal,
      expectedRoundRecord: record,
      body: refreshCredentialsSchema.parse(options.body),
    };
  }
  if (path === tableRoundPath + '/submit') return captureSubmission(context, options, record);
  if (
    !isTableRoundRecovery(path) ||
    options.expectedRoundPreparation !== undefined ||
    (path.endsWith('/cancel-attempt') && !record.cancellationRequested)
  )
    throw new ApiFailure(401, 'refused');
  const body = originalOperationProofSchema.parse(options.body);
  if (JSON.stringify(body) !== JSON.stringify(record.proof)) throw new ApiFailure(401, 'refused');
  return { ...options, principal: record.principal, expectedRoundRecord: record, body };
}
function captureSubmission(
  context: TenantContext,
  options: RequestOptions,
  record: ReturnType<typeof scopedTableRound>,
): RequestOptions {
  const prepared = scopedRoundPreparation(
    context,
    record.principal,
    options.expectedRoundPreparation,
  );
  const body = submissionSchema.parse(options.body);
  const expected = {
    ...record.intent,
    payloadHash: record.proof.payloadHash,
    ownerProof: record.proof.ownerProof,
  };
  if (
    record.cancellationRequested ||
    prepared.sessionId !== record.sessionId ||
    JSON.stringify(prepared.intent) !== JSON.stringify(record.intent) ||
    JSON.stringify(body) !== JSON.stringify(expected)
  )
    throw new ApiFailure(401, 'refused');
  return {
    ...options,
    principal: record.principal,
    expectedRoundPreparation: prepared,
    expectedRoundRecord: record,
    body,
  };
}
