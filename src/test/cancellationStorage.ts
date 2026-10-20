import { SessionRepository } from '../core/sessionRepository';
import { TenantBoundary } from '../core/tenantContext';
import { secretKey } from '../core/credentials';
import { cancellationRecord } from './cancellation';
import { fixtureDirectory, memorySecrets, tenantA } from './fixtures';
export function cancellationStorageFixture(customer = false) {
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const store = memorySecrets();
  const record = cancellationRecord(customer);
  const principal = record.principal;
  const repository = new SessionRepository(store);
  if (record.authority.kind === 'original')
    store.values.set(
      secretKey(context, 'order-decisions', principal),
      JSON.stringify([
        {
          ...record.authority.proof,
          outcome: 'Applied',
          orderId: record.intent.orderId,
          recordedAt: record.recordedAt,
        },
      ]),
    );
  const guard = () => {};
  const preparation = {
    schemaVersion: 1 as const,
    orderId: record.intent.orderId,
    expectedVersion: 7,
    allowed: true,
    reason: null,
    payloadHash: record.intent.payloadHash,
  };
  const prepare = () =>
    repository.cancellations.prepare(
      context,
      principal,
      record.authority,
      preparation,
      () => record.intent.operationId,
      guard,
    );
  return { boundary, context, store, record, principal, repository, guard, preparation, prepare };
}
