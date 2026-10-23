import { bindPreparedTablePayment, tablePaymentPreparedSchema } from './tablePaymentPrepared';
import { bindTablePaymentResolution, tablePaymentResolutionSchema } from './tablePaymentResolution';
import { bindTableCheckoutDecision, tableCheckoutDecisionSchema } from './tableCheckoutDecision';
import {
  scopedTablePaymentPreparation,
  type TablePaymentPreparation,
} from '../core/tablePaymentPreparation';
import { scopedTablePayment, type TablePaymentRecord } from '../core/tablePaymentRecord';
import {
  tableContributionPath,
  tableContributionCheckoutPath,
} from '../core/tableContributionRequest';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
export async function prepareTableContribution(
  client: CustomerTransport,
  context: TenantContext,
  input: TablePaymentPreparation,
  guard: () => void,
  locale: string,
) {
  const preparation = scopedTablePaymentPreparation(context, input.principal, input);
  guard();
  const response = await client.request(
    context,
    tableContributionPath + '/prepare',
    tablePaymentPreparedSchema,
    {
      method: 'POST',
      credentials: 'table-payment-prepare',
      principal: preparation.principal,
      expectedContributionPreparation: preparation,
      body: preparation.intent,
      assertCurrent: guard,
      locale,
    },
  );
  guard();
  return bindPreparedTablePayment(preparation.intent, preparation.currency, response);
}
export async function resolveTableContribution(
  client: CustomerTransport,
  context: TenantContext,
  input: TablePaymentRecord,
  action: { phase: 'submit'; preparation: TablePaymentPreparation } | { phase: 'recover' | 'stop' },
  guard: () => void,
  locale: string,
) {
  const record = scopedTablePayment(context, input.principal, input);
  guard();
  const response = await client.request(
    context,
    tableContributionPath + '/' + action.phase,
    tablePaymentResolutionSchema,
    {
      method: 'POST',
      credentials: 'table-payment-operation',
      principal: record.principal,
      expectedContributionRecord: record,
      ...('preparation' in action ? { expectedContributionPreparation: action.preparation } : {}),
      body:
        action.phase === 'submit' ? { intent: record.intent, proof: record.proof } : record.proof,
      assertCurrent: guard,
      locale,
    },
  );
  guard();
  return bindTablePaymentResolution(record.intent, response, action.phase);
}
export async function resolveTableCheckout(
  client: CustomerTransport,
  context: TenantContext,
  input: TablePaymentRecord,
  action: { phase: 'start'; preparation: TablePaymentPreparation } | { phase: 'recover' | 'stop' },
  guard: () => void,
  locale: string,
) {
  const record = scopedTablePayment(context, input.principal, input);
  if (record.resolution?.outcome !== 'Applied') throw new ApiFailure(409, 'refused');
  guard();
  const response = await client.request(
    context,
    tableContributionCheckoutPath + '/' + action.phase,
    tableCheckoutDecisionSchema,
    {
      method: 'POST',
      credentials: 'table-checkout-operation',
      principal: record.principal,
      expectedContributionRecord: record,
      ...('preparation' in action ? { expectedContributionPreparation: action.preparation } : {}),
      body: record.proof,
      assertCurrent: guard,
      locale,
    },
  );
  guard();
  return bindTableCheckoutDecision(
    {
      tenantId: record.tenantId,
      operationId: record.proof.operationId,
      serviceSessionId: record.intent.serviceSessionId,
      attemptId: record.resolution.attemptId,
      amountMinor: record.review.amountMinor,
      currency: record.review.currency,
      expiresAt: record.checkout?.expiresAt ?? null,
    },
    response,
  );
}
