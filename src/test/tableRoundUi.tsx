import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { setReservationUiRepository } from './reservationUiSetup';
import { tableRoundControllerFixture } from './tableRoundController';
import { mockWorkspaceOwner } from './workspaceOwner';
import useBootstrap from '../features/restaurant/useBootstrap';
import BasketProvider from '../features/basket/BasketProvider';
import RoundProvider from '../features/tables/RoundProvider';
export async function tableRoundUiFixture(customer = false, pending = false) {
  const f = await tableRoundControllerFixture(customer);
  setReservationUiRepository(f.repository);
  const state = mockWorkspaceOwner(f);
  jest.mocked(randomUUID).mockImplementation(f.createId);
  const bootstrapQuery = { data: f.request.bootstrap, isPending: false } as ReturnType<
    typeof useBootstrap
  >;
  jest.mocked(useBootstrap).mockReturnValue(bootstrapQuery);
  if (pending) await f.install();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={cache}>
        <RoundProvider>
          <BasketProvider>{children}</BasketProvider>
        </RoundProvider>
      </QueryClientProvider>
    );
  }
  return { ...f, state, bootstrapQuery, cache, Wrapper };
}
