import { bindPreparedTablePlan } from '../api/tablePlanPrepared';
import { ApiFailure } from './apiFailure';
import { storedTableAuthority } from './storedTableAuthority';
import { assertPurchaseClaims } from './purchaseClaim';
import { assertTablePurchasesResolved } from './tablePurchaseHold';
import { scopedTablePlanPreparation, type TablePlanPreparation } from './tablePlanPreparation';
import { scopedTablePlan } from './tablePlanRecord';
import { TablePlanStorage } from './tablePlanStorage';
import type { SecretStore } from './credentials';
import type { TenantContext } from './tenantContext';
// Only the shared installation purchase queue may acknowledge a new original plan.
export async function installTablePlan(
  store: SecretStore,
  context: TenantContext,
  input: TablePlanPreparation,
  response: unknown,
  guard: () => void,
) {
  const preparation = scopedTablePlanPreparation(context, input.principal, input);
  const { principal, intent } = preparation;
  const prepared = bindPreparedTablePlan(intent, preparation.currency, response);
  const storage = new TablePlanStorage(store);
  if (await storage.read(context, principal, guard)) throw new ApiFailure(409, 'refused');
  await assertPurchaseClaims(store, context, principal, guard);
  await assertTablePurchasesResolved(store, context, principal, guard);
  const session = await storedTableAuthority(store, context, principal, preparation, guard, () =>
    scopedTablePlanPreparation(context, principal, preparation),
  );
  return storage.save(
    context,
    scopedTablePlan(context, principal, {
      schemaVersion: 1,
      environment: context.environment,
      tenantId: context.tenant.id,
      principal,
      sessionId: session,
      intent,
      proof: prepared.proof,
      cancellationRequested: false,
      review: {
        totalMinor: prepared.totalMinor,
        currency: prepared.currency,
        roundingIncrementMinor: prepared.roundingIncrementMinor,
        sharesMinor: prepared.sharesMinor,
      },
      resolution: null,
    }),
    guard,
  );
}
