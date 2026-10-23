import { ApiFailure } from './apiFailure';
import type { CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
import { privateTableCustomerHeaders, tablePreparationHeaders } from './privateTableHeaders';
import { scopedTablePaymentPreparation } from './tablePaymentPreparation';
import { scopedTablePayment, type TablePaymentRecord } from './tablePaymentRecord';
import { scopedTableVisit } from './tableVisitRecord';
import type { TenantContext } from './tenantContext';
export async function tableContributionHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  if (!options.principal || !options.assertCurrent) throw new ApiFailure(401, 'refused');
  const principal = options.principal;
  const record =
    options.expectedContributionRecord === undefined
      ? null
      : scopedTablePayment(context, principal, options.expectedContributionRecord);
  const preparation =
    options.expectedContributionPreparation === undefined
      ? null
      : scopedTablePaymentPreparation(context, principal, options.expectedContributionPreparation);
  if (!record && !preparation) throw new ApiFailure(401, 'refused');
  const headers: Record<string, string> = {
    'X-Session-Id': record?.sessionId ?? preparation!.sessionId,
  };
  if (preparation)
    Object.assign(
      headers,
      await tablePreparationHeaders(context, vault, options, preparation, () =>
        scopedTablePaymentPreparation(context, principal, preparation),
      ),
    );
  else Object.assign(headers, await checkoutParticipantHeader(context, vault, options, record));
  Object.assign(
    headers,
    await privateTableCustomerHeaders(
      context,
      vault,
      options,
      options.credentials === 'table-payment-renewal',
    ),
  );
  if (record) {
    const raw = await vault.tablePaymentRecord(context, principal);
    options.assertCurrent();
    const saved = scopedTablePayment(context, principal, raw === null ? null : JSON.parse(raw));
    if (JSON.stringify(saved) !== JSON.stringify(record)) throw new ApiFailure(401, 'refused');
  }
  if (preparation) scopedTablePaymentPreparation(context, principal, preparation);
  options.assertCurrent();
  return headers;
}

async function checkoutParticipantHeader(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
  record: TablePaymentRecord | null,
): Promise<Record<string, string>> {
  if (!record || options.credentials !== 'table-checkout-operation' || record.cancellationRequested)
    return {};
  // Existing checkout navigation requires a live original visit. Private money recovery remains available without it.
  const principal = record.principal;
  const raw = await vault.capability(context, 'table-participant', principal);
  options.assertCurrent!();
  if (raw === null) return {};
  const visit = scopedTableVisit(context, principal, JSON.parse(raw));
  return visit.identity.serviceSessionId === record.intent.serviceSessionId &&
    Date.parse(visit.identity.expiresAt) > Date.now()
    ? { 'X-Table-Participant': visit.identity.participantToken }
    : {};
}
