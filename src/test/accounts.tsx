import '../i18n';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bootstrapSchema } from '../core/capabilities';
import { SessionRepository } from '../core/sessionRepository';
import { CustomerTransport, type Fetch } from '../core/transport';
import { TenantBoundary } from '../core/tenantContext';
import { fixtureDirectory, memorySecrets, tenantA } from './fixtures';
import { useRestaurant } from '../features/restaurant/RestaurantProvider';
import useBootstrap from '../features/restaurant/useBootstrap';
import SessionProvider from '../features/account/SessionProvider';
export const accountStore = memorySecrets();
export const accountRepository = new SessionRepository(accountStore);
export function accountFixture() {
  const directory = fixtureDirectory();
  const boundary = new TenantBoundary(directory);
  const context = boundary.select(tenantA);
  const fetcher = jest.fn<ReturnType<Fetch>, Parameters<Fetch>>();
  const client = new CustomerTransport(boundary, accountRepository.vault, fetcher);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  }
  return {
    context,
    fetcher,
    queryClient,
    Wrapper,
    state: {
      context,
      client,
      directory,
      loading: false,
      select: () => true,
      clear: () => undefined,
      refresh: () => undefined,
    },
  };
}
export const accountBootstrap = {
  data: bootstrapSchema.parse({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'EUR',
    locale: 'en',
    timezone: 'Europe/Paris',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: {},
    capabilities: { accounts: 'enabled' },
  }),
  isPending: false,
};
export { customerProfile } from './customerProfile';

export function prepareAccountFixture() {
  const fixture = accountFixture();
  jest.mocked(useRestaurant).mockReturnValue(fixture.state);
  jest.mocked(useBootstrap).mockReturnValue(accountBootstrap as ReturnType<typeof useBootstrap>);
  return fixture;
}
