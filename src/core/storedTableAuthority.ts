import { ApiFailure } from './apiFailure';
import { canonicalUuidSchema } from './identifiers';
import { scopedTableVisit, type TableVisitRecord } from './tableVisitRecord';
import { secretKey, type SecretStore, type Principal } from './credentials';
import type { TenantContext } from './tenantContext';
// Called under the purchase queue; revalidate live preparation after both secure reads.
export async function storedTableAuthority(
  store: SecretStore,
  context: TenantContext,
  principal: Principal,
  expected: { sessionId: string; visit: TableVisitRecord },
  guard: () => void,
  validate: () => unknown,
) {
  const session = canonicalUuidSchema.parse(
    await store.get(secretKey(context, 'guest-session', principal)),
  );
  guard();
  const raw = await store.get(secretKey(context, 'table-participant', principal));
  guard();
  const visit = scopedTableVisit(context, principal, raw === null ? null : JSON.parse(raw));
  validate();
  if (session !== expected.sessionId || JSON.stringify(visit) !== JSON.stringify(expected.visit))
    throw new ApiFailure(409, 'refused');
  return session;
}
