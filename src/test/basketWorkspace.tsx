import { mockWorkspaceOwner } from './workspaceOwner';
import '../i18n';
import { bootstrapSchema } from '../core/capabilities';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BasketProvider from '../features/basket/BasketProvider';
import useBootstrap from '../features/restaurant/useBootstrap';
import { basketControllerFixture } from './basketController';
export async function basketWorkspaceFixture(customer = false) {
  const f = await basketControllerFixture(customer);
  const cache = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const state = mockWorkspaceOwner(f);
  jest
    .mocked(useBootstrap)
    .mockReturnValue({ data: bootstrapSchema.parse(f.bootstrap), isPending: false } as ReturnType<
      typeof useBootstrap
    >);
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={cache}>
        <BasketProvider>{children}</BasketProvider>
      </QueryClientProvider>
    );
  }
  return { ...f, cache, state, Wrapper };
}
