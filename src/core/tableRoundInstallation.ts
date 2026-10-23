import { storedTableAuthority } from './storedTableAuthority';
import { assertTablePurchasesResolved } from './tablePurchaseHold';
import { bindPreparedTableRound } from '../api/tableRoundContract';
import { ApiFailure } from './apiFailure';
import { assertPurchaseClaims } from './purchaseClaim';
import { scopedRoundPreparation, type TableRoundPreparation } from './tableRoundPreparation';
import { scopedTableRound } from './tableRoundRecord';
import type { SecretStore } from './credentials';
import { TableRoundStorage } from './tableRoundStorage';
import type { TenantContext } from './tenantContext';

// Run inside SessionRepository's single secure write queue, shared with every purchase writer.
export async function installTableRound(
  store: SecretStore,
  context: TenantContext,
  input: TableRoundPreparation,
  response: unknown,
  guard: () => void,
) {
  const storage = new TableRoundStorage(store);
  const preparation = scopedRoundPreparation(context, input.principal, input);
  const { principal, intent } = preparation;
  const prepared = bindPreparedTableRound(intent, preparation.currency, response);
  if (await storage.read(context, principal, guard)) throw new ApiFailure(409, 'refused');
  // A malformed or partially saved original claim must also prevent a competing purchase.
  await assertPurchaseClaims(store, context, principal, guard);
  await assertTablePurchasesResolved(store, context, principal, guard);
  const session = await storedTableAuthority(store, context, principal, preparation, guard, () =>
    scopedRoundPreparation(context, principal, preparation),
  );
  return storage.save(
    context,
    scopedTableRound(context, principal, {
      schemaVersion: 1,
      environment: context.environment,
      tenantId: context.tenant.id,
      principal,
      sessionId: session,
      intent,
      proof: prepared.proof,
      cancellationRequested: false,
      resolution: null,
    }),
    guard,
  );
}
