import { originalTableBody } from './originalTableBody';
import { z } from 'zod';
import { originalOperationProofSchema } from '../api/originalOperationProof';
import { tablePlanIntentSchema } from '../api/tablePlanIntent';
import { scopedTablePlanPreparation } from './tablePlanPreparation';
import { scopedTablePlan } from './tablePlanRecord';
import { refreshCredentialsSchema } from './refreshCredentials';
import { ApiFailure } from './apiFailure';
import type { RequestOptions } from './httpTypes';
import type { Principal } from './credentials';
import type { TenantContext } from './tenantContext';
export const tablePlanPath = '/api/customer-mobile/table-payments/plans';
const submission = z.strictObject({
  intent: tablePlanIntentSchema,
  proof: originalOperationProofSchema,
});
export function isTablePlanRecovery(path: string) {
  return path === tablePlanPath + '/recover' || path === tablePlanPath + '/stop';
}
export function captureTablePlanRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  const mode = options.credentials;
  if (
    mode !== 'table-plan-prepare' &&
    mode !== 'table-plan-operation' &&
    mode !== 'table-plan-renewal'
  ) {
    if (
      options.expectedPlanPreparation !== undefined ||
      options.expectedPlanRecord !== undefined ||
      path.split('?')[0]?.startsWith(tablePlanPath + '/')
    )
      throw new ApiFailure(401, 'refused');
    return options;
  }
  if (options.method !== 'POST' || !options.principal || !options.assertCurrent)
    throw new ApiFailure(401, 'refused');
  if (mode === 'table-plan-prepare')
    return capturePreparationRequest(context, path, options, options.principal);
  const record = scopedTablePlan(context, options.principal, options.expectedPlanRecord);
  if (record.resolution) throw new ApiFailure(401, 'refused');
  if (mode === 'table-plan-renewal') {
    if (
      path !== '/api/Auth/refresh-token' ||
      record.principal.kind !== 'customer' ||
      options.expectedPlanPreparation !== undefined
    )
      throw new ApiFailure(401, 'refused');
    return {
      ...options,
      principal: record.principal,
      expectedPlanRecord: record,
      body: refreshCredentialsSchema.parse(options.body),
    };
  }
  const initial = path === tablePlanPath + '/submit';
  if (!initial && !isTablePlanRecovery(path)) throw new ApiFailure(401, 'refused');
  const preparation = initial
    ? scopedTablePlanPreparation(context, record.principal, options.expectedPlanPreparation)
    : undefined;
  if (
    initial
      ? record.cancellationRequested ||
        preparation?.sessionId !== record.sessionId ||
        JSON.stringify(preparation.intent) !== JSON.stringify(record.intent)
      : options.expectedPlanPreparation !== undefined ||
        (path.endsWith('/stop') && !record.cancellationRequested)
  )
    throw new ApiFailure(401, 'refused');
  const body = originalTableBody(options.body, initial, record, submission);
  return {
    ...options,
    principal: record.principal,
    expectedPlanRecord: record,
    ...(preparation ? { expectedPlanPreparation: preparation } : {}),
    body,
  };
}

function capturePreparationRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
  principal: Principal,
): RequestOptions {
  const prepared = scopedTablePlanPreparation(context, principal, options.expectedPlanPreparation);
  const body = tablePlanIntentSchema.parse(options.body);
  if (
    path !== tablePlanPath + '/prepare' ||
    options.expectedPlanRecord !== undefined ||
    JSON.stringify(body) !== JSON.stringify(prepared.intent)
  )
    throw new ApiFailure(401, 'refused');
  return { ...options, principal: prepared.principal, expectedPlanPreparation: prepared, body };
}
