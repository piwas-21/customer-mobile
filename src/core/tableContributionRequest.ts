import { z } from 'zod';
import { originalOperationProofSchema } from '../api/originalOperationProof';
import { tablePaymentIntentSchema } from '../api/tablePaymentIntent';
import { ApiFailure } from './apiFailure';
import type { RequestOptions } from './httpTypes';
import { scopedTablePaymentPreparation } from './tablePaymentPreparation';
import {
  scopedTablePayment,
  tablePaymentResolved,
  type TablePaymentRecord,
} from './tablePaymentRecord';
import { refreshCredentialsSchema } from './refreshCredentials';
import type { TenantContext } from './tenantContext';
export const tableContributionPath = '/api/customer-mobile/table-payments';
export const tableContributionCheckoutPath = tableContributionPath + '/checkout';
const submission = z.strictObject({
  intent: tablePaymentIntentSchema,
  proof: originalOperationProofSchema,
});
export function isTableContributionRecovery(path: string) {
  return [
    tableContributionPath + '/recover',
    tableContributionPath + '/stop',
    tableContributionCheckoutPath + '/recover',
    tableContributionCheckoutPath + '/stop',
  ].includes(path);
}
export function captureTableContributionRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  const mode = options.credentials;
  if (
    mode !== 'table-payment-prepare' &&
    mode !== 'table-payment-operation' &&
    mode !== 'table-checkout-operation' &&
    mode !== 'table-payment-renewal'
  ) {
    if (
      options.expectedContributionPreparation !== undefined ||
      options.expectedContributionRecord !== undefined ||
      path.startsWith(tableContributionCheckoutPath + '/') ||
      ['prepare', 'submit', 'recover', 'stop'].some(
        (phase) => path.split('?')[0] === tableContributionPath + '/' + phase,
      )
    )
      throw new ApiFailure(401, 'refused');
    return options;
  }
  if (options.method !== 'POST' || !options.principal || !options.assertCurrent)
    throw new ApiFailure(401, 'refused');
  if (mode === 'table-payment-prepare') {
    const prepared = scopedTablePaymentPreparation(
      context,
      options.principal,
      options.expectedContributionPreparation,
    );
    const body = tablePaymentIntentSchema.parse(options.body);
    if (
      path !== tableContributionPath + '/prepare' ||
      options.expectedContributionRecord !== undefined ||
      JSON.stringify(body) !== JSON.stringify(prepared.intent)
    )
      throw new ApiFailure(401, 'refused');
    return {
      ...options,
      principal: prepared.principal,
      expectedContributionPreparation: prepared,
      body,
    };
  }
  return captureOriginal(context, path, options);
}
function captureOriginal(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  const record = scopedTablePayment(
    context,
    options.principal!,
    options.expectedContributionRecord,
  );
  if (options.credentials === 'table-payment-renewal') {
    if (
      path !== '/api/Auth/refresh-token' ||
      record.principal.kind !== 'customer' ||
      options.expectedContributionPreparation !== undefined
    )
      throw new ApiFailure(401, 'refused');
    return {
      ...options,
      principal: record.principal,
      expectedContributionRecord: record,
      body: refreshCredentialsSchema.parse(options.body),
    };
  }
  const { initial, start } = requirePhase(path, options, record);
  const prepared =
    initial || start
      ? scopedTablePaymentPreparation(
          context,
          record.principal,
          options.expectedContributionPreparation,
        )
      : undefined;
  if (
    prepared
      ? prepared.sessionId !== record.sessionId ||
        JSON.stringify(prepared.intent) !== JSON.stringify(record.intent)
      : options.expectedContributionPreparation !== undefined
  )
    throw new ApiFailure(401, 'refused');
  const body = initial
    ? submission.parse(options.body)
    : originalOperationProofSchema.parse(options.body);
  if (
    JSON.stringify(body) !==
    JSON.stringify(initial ? { intent: record.intent, proof: record.proof } : record.proof)
  )
    throw new ApiFailure(401, 'refused');
  return {
    ...options,
    principal: record.principal,
    expectedContributionRecord: record,
    ...(prepared ? { expectedContributionPreparation: prepared } : {}),
    body,
  };
}

function requirePhase(path: string, options: RequestOptions, record: TablePaymentRecord) {
  if (
    path.startsWith(tableContributionCheckoutPath + '/') !==
    (options.credentials === 'table-checkout-operation')
  )
    throw new ApiFailure(401, 'refused');
  const initial = path === tableContributionPath + '/submit';
  const start = path === tableContributionCheckoutPath + '/start';
  if (!initial && !start && !isTableContributionRecovery(path))
    throw new ApiFailure(401, 'refused');
  if ((initial || start) && (record.cancellationRequested || tablePaymentResolved(record)))
    throw new ApiFailure(401, 'refused');
  if (
    (initial && record.resolution !== null) ||
    (start && record.resolution?.outcome !== 'Applied') ||
    (path.endsWith('/stop') && !record.cancellationRequested)
  )
    throw new ApiFailure(401, 'refused');
  return { initial, start };
}
