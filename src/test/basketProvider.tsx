import { renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { SessionRepository } from '../core/sessionRepository';
import { useBasket } from '../features/basket/BasketProvider';
import { basketWorkspaceFixture } from './basketWorkspace';
import { basketInput, currentBasketOwner } from './basketOperations';
import { existingBasketSession } from './basketMutations';
export async function basketProviderFixture(
  install: (repository: SessionRepository) => void,
  pending = false,
  cancelling = false,
) {
  const f = await basketWorkspaceFixture();
  install(f.repository);
  jest.mocked(randomUUID).mockImplementation(f.createId);
  await existingBasketSession(f);
  if (pending) {
    const saved = await f.repository.baskets.prepare(
      f.context,
      f.principal,
      basketInput,
      f.createId,
      currentBasketOwner,
    );
    if (cancelling)
      await f.repository.baskets.requestCancellation(
        f.context,
        f.principal,
        saved.operationId,
        currentBasketOwner,
      );
  }
  const hook = renderHook(() => useBasket(), { wrapper: f.Wrapper });
  await waitFor(() => expect(hook.result.current.basket?.totalItems).toBe(2));
  return {
    ...f,
    hook,
    close() {
      hook.unmount();
      f.cache.clear();
    },
  };
}
