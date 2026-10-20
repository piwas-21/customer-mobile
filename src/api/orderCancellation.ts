import {
  bindCancellationResolution,
  cancellationPreparationSchema,
  cancellationResolutionSchema,
} from './orderCancellationContract';
import { cancellationBody } from '../core/cancellationRequest';
import {
  scopedCancellationRecord,
  type CancellationOperationRecord,
} from '../core/cancellationOperationRecord';
import { decisionProof, orderDecisionSchema, type OrderDecision } from '../core/orderDecisions';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';

export async function prepareOriginalCancellation(
  client: CustomerTransport,
  context: TenantContext,
  saved: OrderDecision,
  assertCurrent: () => void,
  locale: string,
) {
  const decision = orderDecisionSchema.parse(saved);
  if (decision.outcome !== 'Applied' || !decision.orderId) throw new ApiFailure(401, 'refused');
  const proof = decisionProof(decision);
  assertCurrent();
  const result = await client.request(
    context,
    '/api/customer-mobile/orders/cancellation/original/prepare',
    cancellationPreparationSchema,
    {
      method: 'POST',
      credentials: 'order-receipt',
      principal: proof.principal,
      expectedOrderProof: proof,
      body: { schemaVersion: 1, operationId: proof.operationId, payloadHash: proof.payloadHash },
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (result.orderId !== decision.orderId) throw new ApiFailure(200, 'contract');
  return result;
}
export async function resolveCancellation(
  client: CustomerTransport,
  context: TenantContext,
  saved: CancellationOperationRecord,
  phase: 'submit' | 'recover',
  assertCurrent: () => void,
  locale: string,
) {
  const record = scopedCancellationRecord(context, saved.principal, saved);
  if (record.resolution !== null) throw new ApiFailure(401, 'refused');
  assertCurrent();
  const scope = record.authority.kind === 'original' ? 'original/' : '';
  const result = await client.request(
    context,
    `/api/customer-mobile/orders/cancellation/${scope}${phase}`,
    cancellationResolutionSchema,
    {
      method: 'POST',
      credentials: 'order-cancellation',
      principal: record.principal,
      expectedCancellationRecord: record,
      body: cancellationBody(record),
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  return bindCancellationResolution(record.intent, result, phase);
}
