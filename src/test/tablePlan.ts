import { contributionIntent, preparedContribution } from './tablePayment';
export function tablePlanIntent() {
  const payment = contributionIntent();
  return {
    schemaVersion: 1 as const,
    tenantId: payment.tenantId,
    operationId: payment.operationId,
    serviceSessionId: payment.serviceSessionId,
    expectedAccountRevision: payment.expectedAccountRevision,
    shareCount: 3,
    customAmountsMinor: [] as number[],
    supersedesPlanId: null,
  };
}
export function preparedTablePlan() {
  const payment = preparedContribution();
  return {
    schemaVersion: 1 as const,
    proof: { ...payment.proof, ownerProof: 'protected-table-plan-fixture' },
    serviceSessionId: payment.serviceSessionId,
    accountRevision: payment.accountRevision,
    totalMinor: 1400,
    currency: 'CHF' as const,
    roundingIncrementMinor: 5,
    scope: payment.allocations,
    sharesMinor: [465, 465, 470],
  };
}
