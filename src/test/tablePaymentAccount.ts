import type { TablePaymentAccount } from '../api/tablePaymentAccountContract';
import { bootstrapSchema } from '../core/capabilities';
import { tenantA, tenantB } from './fixtures';
import { tableVisitRecord } from './tableAccount';
import { response, setup } from './transport';

export const paymentReadSession = 'ad709a34-6dc7-4698-945d-3ea534a9213e';
export const paymentReadOperation = '11222abe-697b-4f53-a664-afecfbc347b7';
export function tablePaymentAccount(): TablePaymentAccount {
  const allocated = {
    orderId: tenantB,
    orderItemId: paymentReadSession,
    startOrdinal: 1,
    unitCount: 2,
    minorPerUnit: 700,
    amountMinor: 1400,
  };
  return {
    schemaVersion: 1,
    tenantId: tenantA,
    account: {
      serviceSessionId: tenantA,
      status: 'Open',
      accountRevision: 7,
      currency: 'CHF',
      outstandingMinor: 1400,
      reservedMinor: 700,
      availableMinor: 700,
      capturedAccountPaymentMinor: 0,
      outstandingAllocations: [allocated],
      availableAllocations: [{ ...allocated, startOrdinal: 2, unitCount: 1, amountMinor: 700 }],
      activeEqualSharePlan: {
        planId: paymentReadSession,
        accountRevision: 7,
        totalMinor: 1400,
        shareCount: 2,
        currency: 'CHF',
        isOwnPlan: false,
        slots: [
          { ordinal: 1, amountMinor: 700, claimState: 'Reserved', isAvailable: false },
          { ordinal: 2, amountMinor: 700, claimState: null, isAvailable: true },
        ],
        scope: [allocated],
        isCustom: false,
        customAmountsMinor: null,
      },
      activeAttempts: [
        {
          operationId: paymentReadOperation,
          state: 'Reserved',
          version: 2,
          paymentMethod: 'OnlinePayment',
          amountMinor: 700,
          currency: 'CHF',
          reservationExpiresAt: '2035-01-01T00:00:00.1234567Z',
          equalSharePlanId: paymentReadSession,
          equalShareOrdinal: 1,
          isOwnOperation: true,
        },
      ],
      limits: { maximumSelectedUnits: 250, maximumEqualShares: 100, online: null },
      billingAllocationVersion: 1,
    },
  };
}
export function tablePaymentBootstrap() {
  return bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'CHF',
    locale: 'en',
    timezone: 'Europe/Zurich',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: { tableGuestVisitsV1: true, tableAccountPaymentsV1: true },
    capabilities: { accounts: 'enabled', 'table-visits': 'enabled', 'table-payments': 'unknown' },
  });
}
export async function tablePaymentReadFixture(customer = false) {
  const f = setup();
  const visit = {
    ...tableVisitRecord(),
    principal: {
      kind: customer ? ('customer' as const) : ('guest' as const),
      id: customer ? tenantB : 'basket',
    },
  };
  if (customer)
    await f.vault.saveSession(f.context, {
      userId: tenantB,
      accessToken: 'original-access',
      refreshToken: 'original-refresh',
    });
  await f.vault.saveCapability(f.context, 'guest-session', visit.principal, paymentReadSession);
  await f.vault.saveCapability(
    f.context,
    'table-participant',
    visit.principal,
    JSON.stringify(visit),
  );
  f.fetcher.mockResolvedValue(response({ success: true, data: tablePaymentAccount() }));
  const scope = { sessionId: paymentReadSession, currency: 'CHF' as const, visit };
  return { ...f, scope, bootstrap: tablePaymentBootstrap() };
}
