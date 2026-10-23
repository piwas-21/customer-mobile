import { customerAuthResponseSchema } from './customerAuthResponse';
import { refreshCredentialsSchema } from '../core/refreshCredentials';
import { scopedTableRound, type TableRoundRecord } from '../core/tableRoundRecord';
import { scopedTablePayment, type TablePaymentRecord } from '../core/tablePaymentRecord';
import type { CustomerSession } from '../core/credentials';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
export async function refreshPrivateTableSession(
  client: CustomerTransport,
  context: TenantContext,
  session: CustomerSession,
  guard: () => void,
  original:
    | { kind: 'round'; record: TableRoundRecord }
    | { kind: 'contribution'; record: TablePaymentRecord },
) {
  const record =
    original.kind === 'round'
      ? scopedTableRound(context, original.record.principal, original.record)
      : scopedTablePayment(context, original.record.principal, original.record);
  if (record.principal.kind !== 'customer' || record.principal.id !== session.userId)
    throw new ApiFailure(401, 'refused');
  guard();
  const authority =
    original.kind === 'round'
      ? { credentials: 'table-round-renewal' as const, expectedRoundRecord: original.record }
      : {
          credentials: 'table-payment-renewal' as const,
          expectedContributionRecord: original.record,
        };
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
