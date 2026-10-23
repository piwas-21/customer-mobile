import { ApiFailure } from './apiFailure';
import { secretKey, type SecretStore, type Principal } from './credentials';
import { CancellationOperationStorage } from './cancellationOperationStorage';
import { PaymentOperationStorage } from './paymentOperationStorage';
import type { TenantContext } from './tenantContext';
export async function assertUnclaimed(store: SecretStore, key: string, guard: () => void) {
  const raw = await store.get(key);
  guard();
  if (raw !== null) throw new ApiFailure(409, 'refused');
}

export async function assertPurchaseClaims(
  store: SecretStore,
  context: TenantContext,
  principal: Principal,
  guard: () => void,
) {
  await assertUnclaimed(store, secretKey(context, 'basket-operation', principal), guard);
  await assertUnclaimed(store, secretKey(context, 'order-operation-proof', principal), guard);
  await new CancellationOperationStorage(store).assertResolved(context, principal, guard);
  await new PaymentOperationStorage(store).assertResolved(context, principal, guard);
}
