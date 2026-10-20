import { renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { bootstrapSchema } from '../../core/capabilities';
import type { SessionRepository } from '../../core/sessionRepository';
import { useBasket } from './BasketProvider';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
import { existingBasketSession } from '../../test/basketMutations';
import useBootstrap from '../restaurant/useBootstrap';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
it.each([true, false])(
  'exposes points selection only for a current Customer with enabled loyalty: customer=%s',
  async (customer) => {
    const f = await basketWorkspaceFixture(customer);
    mockRepository = f.repository;
    jest.mocked(randomUUID).mockImplementation(f.createId);
    await existingBasketSession(f);
    const initialBootstrap = jest.mocked(useBootstrap)();
    const enabled = bootstrapSchema.parse({
      ...f.bootstrap,
      capabilities: { ...f.bootstrap.capabilities, loyalty: 'enabled' as const },
    });
    jest.mocked(useBootstrap).mockReturnValue({ ...initialBootstrap, data: enabled });
    const view = renderHook(useBasket, { wrapper: f.Wrapper });
    try {
      await waitFor(() => expect(view.result.current.canAdd).toBe(true));
      expect(view.result.current.canRedeemPoints).toBe(customer);
      for (const state of ['disabled', 'unavailable', 'unknown'] as const) {
        jest.mocked(useBootstrap).mockReturnValue({
          ...initialBootstrap,
          data: { ...enabled, capabilities: { ...enabled.capabilities, loyalty: state } },
        });
        view.rerender({});
        expect(view.result.current.canRedeemPoints).toBe(false);
      }
      jest.mocked(useBootstrap).mockReturnValue({
        ...initialBootstrap,
        data: { ...enabled, lifecycle: 'read-only' },
      });
      view.rerender({});
      expect(view.result.current.canRedeemPoints).toBe(false);
    } finally {
      view.unmount();
      f.cache.clear();
    }
  },
);
