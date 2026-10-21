import { bindPreparedTableRound } from '../api/tableRoundContract';
import { ApiFailure } from './apiFailure';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { canonicalUuidSchema } from './identifiers';
import { PaymentOperationStorage } from './paymentOperationStorage';
import { scopedRoundPreparation, type TableRoundPreparation } from './tableRoundPreparation';
import { scopedTableRound } from './tableRoundRecord';
import { scopedTableVisit } from './tableVisitRecord';
import { secretKey, type SecretStore } from './credentials';
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
  await assertUnclaimed(store, secretKey(context, 'basket-operation', principal), guard);
  await assertUnclaimed(store, secretKey(context, 'order-operation-proof', principal), guard);
  await new CancellationOperationStorage(store).assertResolved(context, principal, guard);
  await new PaymentOperationStorage(store).assertResolved(context, principal, guard);
  const session = canonicalUuidSchema.parse(
    await store.get(secretKey(context, 'guest-session', principal)),
  );
  guard();
  const raw = await store.get(secretKey(context, 'table-participant', principal));
  guard();
  const visit = scopedTableVisit(context, principal, raw === null ? null : JSON.parse(raw));
  // Recheck expiry and owner after every asynchronous read, before acknowledging first dispatch.
  scopedRoundPreparation(context, principal, preparation);
  if (
    session !== preparation.sessionId ||
    JSON.stringify(visit) !== JSON.stringify(preparation.visit)
  )
    throw new ApiFailure(409, 'refused');
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

async function assertUnclaimed(store: SecretStore, key: string, guard: () => void) {
  const raw = await store.get(key);
  guard();
  if (raw !== null) throw new ApiFailure(409, 'refused');
}
