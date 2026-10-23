import { tenantA, tenantB } from './fixtures';
import { paymentReadSession, tablePaymentBootstrap } from './tablePaymentAccount';
export const contributionAttempt = '33333333-3333-4333-8333-333333333333';
export function contributionIntent() {
  return {
    schemaVersion: 1 as const,
    tenantId: tenantA,
    operationId: tenantB,
    serviceSessionId: tenantA,
    expectedAccountRevision: 7,
    mode: 'Full' as const,
    selectedUnits: [],
    amountMinor: null,
    equalSharePlanId: null,
    equalShareOrdinal: null,
    customSharePlanId: null,
    customShareOrdinal: null,
  };
}
export function preparedContribution() {
  return {
    schemaVersion: 1 as const,
    proof: {
      schemaVersion: 1 as const,
      tenantId: tenantA,
      operationId: tenantB,
      payloadHash: 'a'.repeat(64),
      ownerProof: 'protected-table-contribution-fixture',
    },
    serviceSessionId: tenantA,
    accountRevision: 7,
    mode: 'Full' as const,
    amountMinor: 1400,
    currency: 'CHF' as const,
    allocations: [
      {
        orderId: tenantB,
        orderItemId: paymentReadSession,
        startOrdinal: 1,
        unitCount: 2,
        minorPerUnit: 700,
        amountMinor: 1400,
      },
    ],
  };
}
export function contributionResolution() {
  return {
    schemaVersion: 1 as const,
    operationId: tenantB,
    serviceSessionId: tenantA,
    outcome: 'Applied' as const,
    attemptId: contributionAttempt,
    state: 'Reserved' as const,
  };
}
export function contributionCheckout() {
  return {
    schemaVersion: 1 as const,
    tenantId: tenantA,
    operationId: tenantB,
    serviceSessionId: tenantA,
    attemptId: contributionAttempt,
    outcome: 'pending' as const,
    amountMinor: 1400,
    currency: 'CHF' as const,
    expiresAt: '2035-01-01T00:00:00Z',
    checkoutUrl: null,
  };
}
export function contributionBootstrap() {
  const bootstrap = tablePaymentBootstrap();
  return {
    ...bootstrap,
    flags: { ...bootstrap.flags, tableGuestAccountPaymentsV1: true },
    capabilities: { ...bootstrap.capabilities, 'table-payments': 'enabled' as const },
  };
}
