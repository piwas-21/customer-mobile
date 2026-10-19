import { basketItemMutationRequest } from './basketItemMutation';
import {
  basketOperationRecordSchema,
  immutableBasketOperation,
  type PendingBasketOperation,
} from '../core/basketOperationRecord';
import { ApiFailure } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';

export function basketOperationRequest(context: TenantContext, pending: PendingBasketOperation) {
  const record = basketOperationRecordSchema.parse(pending);
  if (
    record.phase !== 'ready' ||
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id
  )
    throw new ApiFailure(0, 'refused');
  const operation = immutableBasketOperation(record);
  const request =
    operation.schemaVersion === 1
      ? {
          path: '/api/customer-mobile/basket/items',
          body: { ...operation.request, operationId: operation.operationId },
        }
      : basketItemMutationRequest(operation.request, operation.operationId);
  return { operation, request };
}
