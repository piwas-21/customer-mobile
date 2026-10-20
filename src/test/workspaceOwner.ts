import type { SessionController } from '../core/sessionController';
import type { TenantContext } from '../core/tenantContext';
import type { CustomerTransport } from '../core/transport';
import { useSession } from '../features/account/SessionProvider';
import { useRestaurant } from '../features/restaurant/RestaurantProvider';
export function mockWorkspaceOwner(fixture: {
  sessions: SessionController;
  context: TenantContext;
  client: CustomerTransport;
}) {
  const state = {
    controller: fixture.sessions,
    userId: fixture.sessions.userId,
    ownerVersion: fixture.sessions.ownerVersion,
    needsCleanup: false,
    needsPaymentAttention: false,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  };
  jest.mocked(useSession).mockReturnValue(state);
  jest.mocked(useRestaurant).mockReturnValue({
    context: fixture.context,
    client: fixture.client,
    directory: undefined,
    loading: false,
    select: jest.fn(),
    clear: jest.fn(),
    refresh: jest.fn(),
  });
  return state;
}
