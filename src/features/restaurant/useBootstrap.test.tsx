import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import useBootstrap from './useBootstrap';
import { readBootstrap } from '../../api/bootstrap';
import { useRestaurant } from './RestaurantProvider';
import { TenantBoundary } from '../../core/tenantContext';
import { CustomerTransport } from '../../core/transport';
import { CredentialVault } from '../../core/credentials';
import { fixtureDirectory, memorySecrets, tenantA } from '../../test/fixtures';
jest.mock('../../api/bootstrap', () => ({ readBootstrap: jest.fn() }));
jest.mock('./RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
it('withdraws cached enabled capabilities after a failed refresh and rekeys endpoint migrations', async () => {
  const boundary = new TenantBoundary(fixtureDirectory());
  const context = boundary.select(tenantA);
  const client = new CustomerTransport(boundary, new CredentialVault(memorySecrets()));
  const state = {
    directory: fixtureDirectory(),
    context,
    client,
    loading: false,
    select: () => true,
    refresh: () => undefined,
    clear: () => undefined,
  };
  jest.mocked(useRestaurant).mockReturnValue(state);
  jest.mocked(readBootstrap).mockResolvedValue({
    schemaVersion: 1,
    tenantId: tenantA,
    currency: 'EUR',
    locale: 'fr',
    timezone: 'Europe/Paris',
    lifecycle: 'active',
    compatibility: 'supported',
    modules: [],
    flags: {},
    capabilities: { menu: 'enabled' },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(() => useBootstrap(), { wrapper: Wrapper });
  try {
    await waitFor(() => expect(hook.result.current.data?.capabilities.menu).toBe('enabled'));
    jest.mocked(readBootstrap).mockRejectedValue(new Error('Bootstrap disabled'));
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    jest
      .mocked(useRestaurant)
      .mockReturnValue({ ...state, context: { ...context, generation: context.generation + 1 } });
    hook.rerender(undefined);
    expect(hook.result.current.data).toBeUndefined();
    expect(queryClient.getQueryCache().findAll()).toHaveLength(2);
  } finally {
    hook.unmount();
    queryClient.clear();
  }
});
