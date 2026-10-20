import {
  cancellationOperationRecordSchema,
  scopedCancellationRecord,
} from './cancellationOperationRecord';
import { cancellationRecord } from '../test/cancellation';
import { fixtureDirectory, tenantA, tenantB } from '../test/fixtures';
import { TenantBoundary } from './tenantContext';
it.each([false, true])(
  'retains a minimal cancellation intent for the exact principal (%p)',
  (customer) => {
    const context = new TenantBoundary(fixtureDirectory()).select(tenantA);
    const record = cancellationRecord(customer);
    expect(scopedCancellationRecord(context, record.principal, record)).toEqual(record);
    expect(JSON.stringify(record)).not.toMatch(/email|phone|accessToken|refreshToken/);
    expect(() =>
      scopedCancellationRecord(context, { ...record.principal, id: 'other' }, record),
    ).toThrow();
    expect(() =>
      scopedCancellationRecord({ ...context, environment: 'production' }, record.principal, record),
    ).toThrow();
  },
);
it('cannot select a guest as signed history authority or borrow an original receipt from another principal', () => {
  const guest = cancellationRecord();
  expect(
    cancellationOperationRecordSchema.safeParse({ ...guest, authority: { kind: 'customer' } })
      .success,
  ).toBe(false);
  if (guest.authority.kind !== 'original') throw new Error('Independent fixture changed');
  for (const proof of [
    { ...guest.authority.proof, tenantId: tenantB },
    { ...guest.authority.proof, environment: 'production' },
    { ...guest.authority.proof, principal: { kind: 'guest', id: 'other' } },
  ])
    expect(
      cancellationOperationRecordSchema.safeParse({
        ...guest,
        authority: { kind: 'original', proof },
      }).success,
    ).toBe(false);
});
it('cannot release a pending hold from unseen, another operation, or contradictory cancellation evidence', () => {
  const record = cancellationRecord();
  const cancelled = {
    schemaVersion: 1,
    operationId: record.intent.operationId,
    orderId: record.intent.orderId,
    outcome: 'Cancelled',
    observedVersion: 8,
  };
  expect(
    cancellationOperationRecordSchema.safeParse({ ...record, resolution: cancelled }).success,
  ).toBe(true);
  for (const resolution of [
    { ...cancelled, outcome: 'Unseen', observedVersion: undefined },
    { ...cancelled, operationId: tenantB },
    { ...cancelled, observedVersion: 7 },
  ])
    expect(cancellationOperationRecordSchema.safeParse({ ...record, resolution }).success).toBe(
      false,
    );
});
it('withdraws the old restaurant context before a retained proof can be read', () => {
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const record = cancellationRecord();
  const other = boundary.select(tenantB);
  expect(() => scopedCancellationRecord(context, record.principal, record)).toThrow();
  expect(() => scopedCancellationRecord(other, record.principal, record)).toThrow();
});
