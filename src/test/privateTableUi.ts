import { QueryClient } from '@tanstack/react-query';
import type { Bootstrap } from '../core/capabilities';
import useBootstrap from '../features/restaurant/useBootstrap';
export function privateTableUi(bootstrap: Bootstrap) {
  const bootstrapQuery = { data: bootstrap, isPending: false } as ReturnType<typeof useBootstrap>;
  jest.mocked(useBootstrap).mockReturnValue(bootstrapQuery);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return { bootstrapQuery, cache };
}
