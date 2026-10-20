import {
  bindCancellationResolution,
  cancellationIntentSchema,
  cancellationPreparationSchema,
  cancellationResolutionSchema,
} from './orderCancellationContract';
import {
  cancellationIntent,
  cancellationOperationId,
  cancellationOrderId,
} from '../test/cancellation';
const preparation = {
  schemaVersion: 1,
  orderId: cancellationOrderId,
  expectedVersion: 7,
  allowed: true,
  payloadHash: 'c'.repeat(64),
};
const resolution = {
  schemaVersion: 1 as const,
  operationId: cancellationOperationId,
  orderId: cancellationOrderId,
  outcome: 'Cancelled' as const,
  observedVersion: 8,
  reason: null,
};
it('accepts the independent versioned preparation and omitted null metadata', () => {
  expect(cancellationPreparationSchema.parse(preparation)).toEqual({
    ...preparation,
    reason: null,
  });
  expect(
    cancellationPreparationSchema.parse({
      ...preparation,
      allowed: false,
      reason: 'FinancialReview',
      payloadHash: undefined,
    }),
  ).toEqual({ ...preparation, allowed: false, reason: 'FinancialReview', payloadHash: null });
});
it.each([
  { schemaVersion: 2 },
  { orderId: 'invalid' },
  { expectedVersion: 0 },
  { expectedVersion: 2_147_483_647 },
  { payloadHash: 'c'.repeat(63) },
  { payloadHash: 'C'.repeat(64) },
  { reason: 'FinancialReview' },
  { allowed: false },
  { allowed: false, reason: 'Future' },
  { refundAmount: 100 },
])('refuses contradictory, unsupported or financially enriched preparation %p', (defect) => {
  expect(cancellationPreparationSchema.safeParse({ ...preparation, ...defect }).success).toBe(
    false,
  );
});
it('keeps the mutation intent strict, bounded and separate from customer contact', () => {
  const intent = cancellationIntent();
  expect(cancellationIntentSchema.parse(intent)).toEqual(intent);
  for (const defect of [
    { expectedVersion: 2_147_483_647 },
    { schemaVersion: 2 },
    { customerEmail: 'private' },
  ])
    expect(cancellationIntentSchema.safeParse({ ...intent, ...defect }).success).toBe(false);
});
it('binds cancellation to the original operation/order and an advanced observed version', () => {
  expect(bindCancellationResolution(cancellationIntent(), resolution, 'submit')).toEqual(
    resolution,
  );
  for (const defect of [
    { operationId: cancellationOrderId },
    { orderId: cancellationOperationId },
    { observedVersion: 7 },
  ])
    expect(() =>
      bindCancellationResolution(cancellationIntent(), { ...resolution, ...defect }, 'recover'),
    ).toThrow();
});
it('accepts a canonical refusal even when its observed version is below the requested version', () => {
  const refused = {
    ...resolution,
    outcome: 'Refused' as const,
    observedVersion: 1,
    reason: 'OrderChanged' as const,
  };
  expect(bindCancellationResolution(cancellationIntent(), refused, 'submit')).toEqual(refused);
});
it('recognizes unseen only as a read and never as a completed cancellation', () => {
  const unseen = cancellationResolutionSchema.parse({
    schemaVersion: 1,
    operationId: cancellationOperationId,
    orderId: cancellationOrderId,
    outcome: 'Unseen',
  });
  expect(unseen).toMatchObject({ observedVersion: null, reason: null });
  expect(bindCancellationResolution(cancellationIntent(), unseen, 'recover')).toEqual(unseen);
  expect(() => bindCancellationResolution(cancellationIntent(), unseen, 'submit')).toThrow();
  expect(cancellationResolutionSchema.safeParse({ ...unseen, observedVersion: 8 }).success).toBe(
    false,
  );
});
it.each([
  { outcome: 'Future' },
  { outcome: 'Refused' },
  { observedVersion: null },
  { observedVersion: 0 },
  { reason: 'FinancialReview' },
  { ownerHash: 'private' },
])('refuses unknown or contradictory terminal results %p', (defect) => {
  expect(cancellationResolutionSchema.safeParse({ ...resolution, ...defect }).success).toBe(false);
});
