import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { SessionRepository } from '../../core/sessionRepository';
import { useBasket } from './BasketProvider';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
import { channelInput } from '../../test/basketChannels';
import { basketResponse } from '../../test/basketApi';
import { currentBasketOwner } from '../../test/basketOperations';
import { response } from '../../test/transport';
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
async function setup() {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  jest.mocked(randomUUID).mockImplementation(f.createId);
  const hook = renderHook(() => useBasket(), { wrapper: f.Wrapper });
  await waitFor(() => expect(hook.result.current.canAdd).toBe(true));
  const close = () => {
    hook.unmount();
    f.cache.clear();
  };
  return { ...f, hook, close };
}
it('previews without a session or write, then publishes only the server-priced channel result', async () => {
  const f = await setup();
  try {
    await expect(f.hook.result.current.previewChannel('Takeaway')).resolves.toMatchObject({
      conflicts: [],
    });
    expect(f.fetcher).not.toHaveBeenCalled();
    f.fetcher.mockImplementation(async (url) =>
      response({
        success: true,
        data: url.includes('bootstrap')
          ? f.bootstrap
          : { ...basketResponse(), orderType: 'Takeaway', total: 19.5 },
      }),
    );
    await act(async () => {
      await f.hook.result.current.changeChannel(channelInput(true));
    });
    expect(f.hook.result.current.basket).toMatchObject({ orderType: 'Takeaway', total: 19.5 });
    expect(f.hook.result.current.hasPending).toBe(false);
    expect(await f.repository.baskets.load(f.context, f.principal, currentBasketOwner)).toBeNull();
    const posts = f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]![1].body!)).toMatchObject(channelInput(true));
  } finally {
    f.close();
  }
});
it('holds a lost channel result and only recovers the original saved operation on explicit request', async () => {
  const f = await setup();
  f.fetcher.mockImplementation(async (url) =>
    url.includes('bootstrap') ? response({ success: true, data: f.bootstrap }) : response({}, 503),
  );
  try {
    await act(async () => {
      const work = f.hook.result.current.changeChannel(channelInput(true));
      await expect(
        f.hook.result.current.changeChannel({ ...channelInput(true), orderType: 'Delivery' }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(work).rejects.toMatchObject({ status: 503 });
    });
    expect(f.hook.result.current.hasPending).toBe(true);
    expect(f.hook.result.current.canAdd).toBe(false);
    const posts = () => f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST');
    const original = posts()[0]![1].body;
    await expect(f.hook.result.current.previewChannel('Delivery')).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      f.hook.result.current.changeChannel({ ...channelInput(true), orderType: 'Delivery' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(posts()).toHaveLength(1);
    f.fetcher.mockResolvedValue(
      response({ success: true, data: { ...basketResponse(), orderType: 'Takeaway' } }),
    );
    await act(async () => {
      await f.hook.result.current.recover();
    });
    expect(posts()).toHaveLength(2);
    expect(posts()[1]![1].body).toBe(original);
    expect(f.hook.result.current.hasPending).toBe(false);
    expect(f.hook.result.current.basket?.orderType).toBe('Takeaway');
  } finally {
    f.close();
  }
});
