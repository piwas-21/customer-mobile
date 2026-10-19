import type { SecretStore } from '../core/credentials';
import { SessionRepository } from '../core/sessionRepository';
import { TenantBoundary } from '../core/tenantContext';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from './fixtures';
export const basketPrincipal = { kind: 'guest', id: 'basket' } as const;
export const basketInput = { productId: tenantA, quantity: 2 };
export const basketSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const basketOperationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const currentBasketOwner = () => {};
export function basketOperationsFixture(
  wrap: (store: ReturnType<typeof memorySecrets>) => SecretStore = (store) => store,
) {
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const store = memorySecrets();
  const repository = new SessionRepository(wrap(store));
  let sequence = 0;
  return {
    boundary,
    context,
    store,
    repository,
    createId: () => [basketSessionId, basketOperationId, tenantB][sequence++]!,
  };
}
