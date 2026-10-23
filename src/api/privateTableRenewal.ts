import { scopedTablePlan, type TablePlanRecord } from '../core/tablePlanRecord';
import { customerAuthResponseSchema } from './customerAuthResponse';
import { refreshCredentialsSchema } from '../core/refreshCredentials';
import { scopedTableRound, type TableRoundRecord } from '../core/tableRoundRecord';
import { scopedTablePayment, type TablePaymentRecord } from '../core/tablePaymentRecord';
import type { CustomerSession } from '../core/credentials';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
type OriginalTableRenewal =
  | { kind: 'round'; record: TableRoundRecord }
  | { kind: 'contribution'; record: TablePaymentRecord }
  | { kind: 'plan'; record: TablePlanRecord };
export async function refreshPrivateTableSession(
  client: CustomerTransport,
  context: TenantContext,
  session: CustomerSession,
  guard: () => void,
  original: OriginalTableRenewal,
) {
  const { record, authority } = captureOriginalRenewal(context, original);
  if (record.principal.kind !== 'customer' || record.principal.id !== session.userId)
    throw new ApiFailure(401, 'refused');
  guard();
  const result = await client.request(
    context,
    '/api/Auth/refresh-token',
    customerAuthResponseSchema,
    {
      method: 'POST',
      ...authority,
      principal: record.principal,
      body: refreshCredentialsSchema.parse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      }),
      assertCurrent: guard,
    },
  );
  guard();
  if (result.userId !== record.principal.id) throw new ApiFailure(401, 'refused');
  return {
    userId: result.userId,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

function captureOriginalRenewal(context: TenantContext, original: OriginalTableRenewal) {
  switch (original.kind) {
    case 'round':
      return {
        record: scopedTableRound(context, original.record.principal, original.record),
        authority: {
          credentials: 'table-round-renewal' as const,
          expectedRoundRecord: original.record,
        },
      };
    case 'plan':
      return {
        record: scopedTablePlan(context, original.record.principal, original.record),
        authority: {
          credentials: 'table-plan-renewal' as const,
          expectedPlanRecord: original.record,
        },
      };
    case 'contribution':
      return {
        record: scopedTablePayment(context, original.record.principal, original.record),
        authority: {
          credentials: 'table-payment-renewal' as const,
          expectedContributionRecord: original.record,
        },
      };
  }
}
