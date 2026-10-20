import type { CancellationOperationRecord } from '../core/cancellationOperationRecord';
import type { CancellationIntent } from '../api/orderCancellationContract';
import { tenantA } from './fixtures';
export const cancellationOrderId = '33333333-3333-4333-8333-333333333333';
export const cancellationOperationId = '44444444-4444-4444-8444-444444444444';
export function cancellationIntent(): CancellationIntent {
  return {
    schemaVersion: 1,
    operationId: cancellationOperationId,
    orderId: cancellationOrderId,
    expectedVersion: 7,
    payloadHash: 'c'.repeat(64),
  };
}
export function cancellationRecord(customer = false): CancellationOperationRecord {
  const principal = customer
    ? { kind: 'customer' as const, id: '55555555-5555-4555-8555-555555555555' }
    : { kind: 'guest' as const, id: 'installation' };
  return {
    schemaVersion: 1,
    environment: 'staging',
    tenantId: tenantA,
    principal,
    authority: customer
      ? { kind: 'customer' }
      : {
          kind: 'original',
          proof: {
            schemaVersion: 1,
            environment: 'staging',
            tenantId: tenantA,
            principal,
            sessionId: '66666666-6666-4666-8666-666666666666',
            operationId: '77777777-7777-4777-8777-777777777777',
            payloadHash: 'a'.repeat(64),
            cancellationRequested: false,
          },
        },
    intent: cancellationIntent(),
    recordedAt: '2026-10-20T00:00:00Z',
    resolution: null,
  };
}
