import { act, renderHook } from '@testing-library/react-native';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useCheckoutSavedAddress from './useCheckoutSavedAddress';
import { sessionSetup } from '../../test/sessions';
import { savedAddress } from '../../test/savedAddresses';
import { tenantA } from '../../test/fixtures';
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
async function setup() {
  const f = await sessionSetup();
  const state = {
    controller: f.controller,
    userId: tenantA,
    ownerVersion: f.controller.ownerVersion,
    needsCleanup: false,
    needsPaymentAttention: false,
    loading: false,
    unavailable: false,
    failed: false,
    retry: jest.fn(),
  };
  jest.mocked(useSession).mockReturnValue(state);
  jest.mocked(useRestaurant).mockReturnValue({
    context: f.context,
    client: f.client,
    directory: undefined,
    loading: false,
    select: jest.fn(),
    clear: jest.fn(),
    refresh: jest.fn(),
  });
  const apply = jest.fn();
  const hook = renderHook(
    ({ enabled }: { enabled: boolean }) => useCheckoutSavedAddress(enabled, apply),
    {
      initialProps: { enabled: true },
    },
  );
  return { ...f, ...hook, apply, state };
}
it('opens only explicitly, applies one current-owner selection and closes without a write', async () => {
  const f = await setup();
  expect(f.result.current.current).toBeUndefined();
  act(() => f.result.current.show());
  expect(f.result.current.current?.userId).toBe(tenantA);
  act(() => f.result.current.select(savedAddress()));
  expect(f.apply).toHaveBeenCalledWith(savedAddress());
  expect(f.result.current.current).toBeUndefined();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each(['unavailable', 'needsCleanup'] as const)('refuses private entry when %s', async (key) => {
  const f = await setup();
  jest.mocked(useSession).mockReturnValue({ ...f.state, [key]: true });
  f.rerender({ enabled: true });
  expect(f.result.current.available).toBe(false);
  act(() => f.result.current.show());
  act(() => f.result.current.select(savedAddress()));
  expect(f.result.current.current).toBeUndefined();
  expect(f.apply).not.toHaveBeenCalled();
});
it('withdraws the picker when the account or enabled delivery context changes', async () => {
  const f = await setup();
  act(() => f.result.current.show());
  f.rerender({ enabled: false });
  expect(f.result.current.current).toBeUndefined();
  act(() => f.result.current.select(savedAddress()));
  expect(f.apply).not.toHaveBeenCalled();
  f.rerender({ enabled: true });
  expect(f.result.current.current).toBeUndefined();
  jest.mocked(useSession).mockReturnValue({ ...f.state, userId: null });
  f.rerender({ enabled: true });
  expect(f.result.current.available).toBe(false);
});
it('withdraws the old owner version and permits only an explicit close without applying', async () => {
  const f = await setup();
  act(() => f.result.current.show());
  jest.mocked(useSession).mockReturnValue({ ...f.state, ownerVersion: 'next-owner' });
  f.rerender({ enabled: true });
  expect(f.result.current.current).toBeUndefined();
  act(() => f.result.current.close());
  expect(f.apply).not.toHaveBeenCalled();
});
it('rejects a stale callback after session disposal even before React rerenders', async () => {
  const f = await setup();
  act(() => f.result.current.show());
  const select = f.result.current.select;
  f.controller.dispose();
  act(() => select(savedAddress()));
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.result.current.current).toBeUndefined();
  act(() => f.result.current.show());
  expect(f.result.current.current).toBeUndefined();
});
