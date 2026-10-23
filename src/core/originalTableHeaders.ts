import {
  originalTableSessionHeader,
  privateTableCustomerHeaders,
  tablePreparationHeaders,
} from './privateTableHeaders';
import { ApiFailure } from './apiFailure';
import type { CredentialVault, Principal } from './credentials';
import type { RequestOptions } from './httpTypes';
import type { TenantContext } from './tenantContext';
import type { TableVisitRecord } from './tableVisitRecord';
type RecordIdentity = { sessionId: string };
type PreparationIdentity = RecordIdentity & { principal: Principal; visit: TableVisitRecord };
export async function originalTableHeaders<T extends RecordIdentity, P extends PreparationIdentity>(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
  policy: {
    kind: 'table-round-operation' | 'table-plan-operation';
    record: unknown;
    preparation: unknown;
    renewal: boolean;
    captureRecord: (value: unknown) => T;
    capturePreparation: (value: unknown) => P;
  },
): Promise<Record<string, string>> {
  if (!options.principal || !options.assertCurrent) throw new ApiFailure(401, 'refused');
  const record = policy.record === undefined ? null : policy.captureRecord(policy.record);
  const preparation =
    policy.preparation === undefined ? null : policy.capturePreparation(policy.preparation);
  const headers = originalTableSessionHeader(record, preparation);
  if (preparation)
    Object.assign(
      headers,
      await tablePreparationHeaders(context, vault, options, preparation, () =>
        policy.capturePreparation(preparation),
      ),
    );
  Object.assign(
    headers,
    await privateTableCustomerHeaders(context, vault, options, policy.renewal),
  );
  if (record) {
    const raw = await vault.capability(context, policy.kind, options.principal);
    options.assertCurrent();
    const saved = policy.captureRecord(raw === null ? null : JSON.parse(raw));
    if (JSON.stringify(saved) !== JSON.stringify(record)) throw new ApiFailure(401, 'refused');
  }
  if (preparation) policy.capturePreparation(preparation);
  options.assertCurrent();
  return headers;
}
