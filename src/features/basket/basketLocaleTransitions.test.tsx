import i18n from '../../i18n';
import { act, waitFor } from '@testing-library/react-native';
import type { SessionRepository } from '../../core/sessionRepository';
import { basketProviderFixture } from '../../test/basketProvider';
import { basketMutation } from '../../test/basketMutations';
import { basketResponse } from '../../test/basketApi';
import { deferred } from '../../test/deferred';
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
beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  await i18n.changeLanguage('en');
});
it.each([false, true])(
  'withdraws cached other-locale quotes after acceptance (switch during POST: %s)',
  async (duringWrite) => {
    const f = await basketProviderFixture((repository) => {
      mockRepository = repository;
    });
    const write = deferred<Response>();
    const read = deferred<Response>();
    const updated = { ...basketResponse(), total: 31, purchaseFingerprint: 'B'.repeat(64) };
    let accepted = false;
    f.fetcher.mockImplementation(async (url, request) => {
      if (url.includes('bootstrap')) return response({ success: true, data: f.bootstrap });
      if (request.method === 'POST') return write.promise;
      if (accepted) return read.promise;
      return response({ success: true, data: basketResponse() });
    });
    try {
      await act(async () => {
        await i18n.changeLanguage('fr');
      });
      await waitFor(() => expect(f.hook.result.current.basket?.total).toBe(17.2));
      await act(async () => {
        await i18n.changeLanguage('en');
      });
      let result!: Promise<void>;
      await act(async () => {
        result = f.hook.result.current.mutate(basketMutation());
      });
      await waitFor(() =>
        expect(f.fetcher.mock.calls.some(([, request]) => request.method === 'POST')).toBe(true),
      );
      if (duringWrite)
        await act(async () => {
          await i18n.changeLanguage('fr');
        });
      accepted = true;
      await act(async () => {
        write.resolve(response({ success: true, data: updated }));
        await result;
      });
      if (!duringWrite)
        await act(async () => {
          await i18n.changeLanguage('fr');
        });
      expect(f.hook.result.current.basket).toBeUndefined();
      expect(f.hook.result.current.canAdd).toBe(false);
      expect(f.hook.result.current.hasPending).toBe(false);
      await act(async () => {
        read.resolve(response({ success: true, data: updated }));
      });
      await waitFor(() => expect(f.hook.result.current.canAdd).toBe(true));
      expect(f.hook.result.current.basket?.total).toBe(31);
      expect(f.hook.result.current.basket?.purchaseFingerprint).toBe('B'.repeat(64));
      expect(f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(
        1,
      );
    } finally {
      write.resolve(response({}, 503));
      read.resolve(response({}, 503));
      f.close();
    }
  },
);
it('keeps accepted cancellation proof when an active other-locale refresh fails', async () => {
  const f = await basketProviderFixture((repository) => {
    mockRepository = repository;
  }, true);
  const write = deferred<Response>();
  let operationId = '';
  f.fetcher.mockImplementation(async (url, request) => {
    if (url.includes('bootstrap')) return response({ success: true, data: f.bootstrap });
    if (request.method === 'POST') {
      operationId = JSON.parse(String(request.body)).operationId;
      return write.promise;
    }
    return response({}, 503);
  });
  try {
    let result!: Promise<void>;
    await act(async () => {
      result = f.hook.result.current.cancel();
    });
    await waitFor(() => expect(operationId).not.toBe(''));
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    await act(async () => {
      write.resolve(
        response({
          success: true,
          data: { operationId, outcome: 'Applied', basket: basketResponse() },
        }),
      );
      await result;
    });
    await waitFor(() => expect(f.hook.result.current.failed).toBe(true));
    expect(f.hook.result.current.resolution).toBe('Applied');
    expect(f.hook.result.current.hasPending).toBe(false);
    expect(f.hook.result.current.canAdd).toBe(false);
    expect(f.hook.result.current.basket).toBeUndefined();
    expect(f.fetcher.mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1);
  } finally {
    write.resolve(response({}, 503));
    f.close();
  }
});
