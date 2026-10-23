import { storedTableAuthority } from './storedTableAuthority';
import { bindPreparedTablePayment } from '../api/tablePaymentPrepared';
import { ApiFailure } from './apiFailure';
import { assertPurchaseClaims } from './purchaseClaim';
import { TableRoundStorage } from './tableRoundStorage';
import {
  scopedTablePaymentPreparation,
  type TablePaymentPreparation,
} from './tablePaymentPreparation';
import { scopedTablePayment } from './tablePaymentRecord';
import { TablePaymentStorage } from './tablePaymentStorage';
import type { SecretStore } from './credentials';
import type { TenantContext } from './tenantContext';
// Called only while SessionRepository holds the shared secure write queue.
export async function installTablePayment(
  store: SecretStore,
  context: TenantContext,
  input: TablePaymentPreparation,
  response: unknown,
  guard: () => void,
) {
  const preparation = scopedTablePaymentPreparation(context, input.principal, input);
  const { principal, intent } = preparation;
  const prepared = bindPreparedTablePayment(intent, preparation.currency, response);
  const storage = new TablePaymentStorage(store);
  if (await storage.read(context, principal, guard)) throw new ApiFailure(409, 'refused');
  await assertPurchaseClaims(store, context, principal, guard);
  await new TableRoundStorage(store).assertResolved(context, principal, guard);
  const session = await storedTableAuthority(store, context, principal, preparation, guard, () =>
    scopedTablePaymentPreparation(context, principal, preparation),
  );
  return storage.save(
    context,
    scopedTablePayment(context, principal, {
      schemaVersion: 1,
      environment: context.environment,
      tenantId: context.tenant.id,
      principal,
      sessionId: session,
      intent,
      proof: prepared.proof,
      review: {
        mode: prepared.mode,
        amountMinor: prepared.amountMinor,
        currency: prepared.currency,
      },
      cancellationRequested: false,
      resolution: null,
      checkout: null,
    }),
    guard,
  );
}
