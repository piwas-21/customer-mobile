import { basketChannelRequest } from './basketChannel';
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
  const request = requestFor(operation);
  return { operation, request };
}

function requestFor(operation: PendingBasketOperation) {
  switch (operation.schemaVersion) {
    case 1:
      return {
        path: '/api/customer-mobile/basket/items',
        body: { ...operation.request, operationId: operation.operationId },
      };
    case 2:
      return basketItemMutationRequest(operation.request, operation.operationId);
    case 3:
      return basketChannelRequest(operation.request, operation.operationId);
  }
}
