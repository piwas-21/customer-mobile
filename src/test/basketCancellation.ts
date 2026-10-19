import { basketControllerFixture } from './basketController';
import { basketMutation, existingBasketSession } from './basketMutations';
import { basketInput, currentBasketOwner } from './basketOperations';
import type { SecretStore } from '../core/credentials';
export async function pendingCancellationFixture(
  edit = false,
  wrap?: (store: SecretStore) => SecretStore,
) {
  const f = await basketControllerFixture(false, wrap);
  if (edit) await existingBasketSession(f);
  const pending = await f.repository.baskets.prepareRequest(
    f.context,
    f.principal,
    edit
      ? { schemaVersion: 2, request: basketMutation() }
      : { schemaVersion: 1, request: basketInput },
    f.createId,
    currentBasketOwner,
  );
  return { ...f, pending };
}
