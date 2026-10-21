import { scopedTableVisit, type TableVisitRecord } from '../core/tableVisitRecord';
import { bootstrapSchema, canUse, type Bootstrap } from '../core/capabilities';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { tableAccountSchema } from './tableAccountContract';
import { tableQrSchema, tableVisitIdentitySchema } from './tableVisitContract';
export function assertTableVisitEnabled(context: TenantContext, input: Bootstrap) {
  const bootstrap = bootstrapSchema.parse(input);
  if (
    bootstrap.tenantId !== context.tenant.id ||
    !canUse(bootstrap, 'table-visits') ||
    bootstrap.flags.tableGuestVisitsV1 !== true ||
    !bootstrap.currency
  )
    throw new ApiFailure(409, 'refused');
}
export async function joinTableVisit(
  client: CustomerTransport,
  context: TenantContext,
  bootstrap: Bootstrap,
  qrCodeData: string,
  assertCurrent: () => void,
  locale: string,
) {
  assertTableVisitEnabled(context, bootstrap);
  const qr = tableQrSchema.parse(qrCodeData);
  assertCurrent();
  const identity = await client.request(
    context,
    '/api/table-guest-visits/join',
    tableVisitIdentitySchema,
    {
      method: 'POST',
      body: { qrCodeData: qr },
      credentials: 'none',
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (Date.parse(identity.expiresAt) <= Date.now()) throw new ApiFailure(200, 'contract');
  return identity;
}
export async function readTableAccount(
  client: CustomerTransport,
  context: TenantContext,
  bootstrap: Bootstrap,
  input: TableVisitRecord,
  assertCurrent: () => void,
  locale: string,
) {
  assertTableVisitEnabled(context, bootstrap);
  const record = scopedTableVisit(context, input.principal, input);
  const identity = record.identity;
  assertCurrent();
  const result = await client.request(
    context,
    '/api/table-guest-visits/' + identity.serviceSessionId + '/account',
    tableAccountSchema,
    {
      method: 'GET',
      credentials: 'table-account',
      principal: record.principal,
      expectedTableVisit: record,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (
    result.serviceSessionId !== identity.serviceSessionId ||
    Date.parse(identity.expiresAt) <= Date.now()
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
