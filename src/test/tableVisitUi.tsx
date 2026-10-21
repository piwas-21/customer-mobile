import '../i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { tableVisitControllerFixture } from './tableVisitController';
import { mockWorkspaceOwner } from './workspaceOwner';
import useBootstrap from '../features/restaurant/useBootstrap';
import TableScreen from '../features/tables/TableScreen';
export async function tableVisitUiFixture(
  install: (repo: Awaited<ReturnType<typeof tableVisitControllerFixture>>['repository']) => void,
  joined = false,
  configure: (fixture: Awaited<ReturnType<typeof tableVisitControllerFixture>>) => void = () => {},
) {
  const f = await tableVisitControllerFixture();
  install(f.repository);
  jest.mocked(randomUUID).mockImplementation(f.createId);
  const state = mockWorkspaceOwner({
    sessions: f.controller,
    context: f.context,
    client: f.client,
  });
  const bootstrapQuery = {
    data: f.bootstrap,
    isPending: false,
  } as ReturnType<typeof useBootstrap>;
  jest.mocked(useBootstrap).mockReturnValue(bootstrapQuery);
  if (joined) await f.install();
  configure(f);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => (
    <QueryClientProvider client={cache}>
      <TableScreen />
    </QueryClientProvider>
  );
  const screen = render(tree());
  return {
    ...f,
    bootstrapQuery,
    cache,
    state,
    screen,
    rerender: () => screen.rerender(tree()),
    close: () => {
      screen.unmount();
      cache.clear();
      f.actor.dispose();
    },
  };
}
