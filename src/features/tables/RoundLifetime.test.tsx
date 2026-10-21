import { TableRoundController } from '../../core/tableRoundController';
import { tenantB } from '../../test/fixtures';
import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import BasketScreen from '../basket/BasketScreen';
import { tableRoundUiFixture } from '../../test/tableRoundUi';
import { deferred } from '../../test/deferred';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

it.each(['same-owner-revision', 'background', 'capability'])(
  'withdraws a paused private review before rendering or submitting after %s',
  async (mode) => {
    const f = await tableRoundUiFixture(true);
    const entered = deferred<void>();
    const release = deferred<void>();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) => {
      if (url.endsWith('/prepare')) {
        entered.resolve();
        await release.promise;
      }
      return normal(url, options);
    });
    const screen = render(<BasketScreen />, { wrapper: f.Wrapper });
    try {
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Review this table round' })).not.toBeDisabled(),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Review this table round' }));
      await entered.promise;
      await act(async () => {
        if (mode === 'same-owner-revision') f.state.ownerVersion += ':new';
        if (mode === 'capability')
          f.bootstrapQuery.data = { ...f.request.bootstrap, flags: { tableGuestVisitsV1: false } };
        if (mode === 'background') {
          for (const [event, handler] of jest.mocked(AppState.addEventListener).mock.calls) {
            if (event === 'change') handler('background');
          }
        }
        screen.rerender(<BasketScreen />);
        release.resolve();
      });
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Send round to the restaurant' })).toBeNull(),
      );
      expect(await f.repository.tableRounds.load(f.context, f.principal, f.guard)).toBeNull();
      expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    } finally {
      release.resolve();
      screen.unmount();
      f.cache.clear();
    }
  },
);
it('closing an ordinary review consumes it without installing or sending an attempt', async () => {
  const f = await tableRoundUiFixture();
  const screen = render(<BasketScreen />, { wrapper: f.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review this table round' })).not.toBeDisabled(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Review this table round' }));
    await screen.findByRole('button', { name: 'Send round to the restaurant' });
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Send round to the restaurant' })).toBeNull(),
    );
    expect(await f.repository.tableRounds.load(f.context, f.principal, f.guard)).toBeNull();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
  } finally {
    screen.unmount();
    f.cache.clear();
  }
});

it('unmounting the review owner invalidates a paused preparation while the root controller remains alive', async () => {
  const f = await tableRoundUiFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const normal = f.fetcher.getMockImplementation()!;
  const prepare = jest.spyOn(TableRoundController.prototype, 'prepare');
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/prepare')) {
      entered.resolve();
      await release.promise;
    }
    return normal(url, options);
  });
  const screen = render(<BasketScreen />, { wrapper: f.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review this table round' })).not.toBeDisabled(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Review this table round' }));
    await entered.promise;
    const actor = prepare.mock.contexts[0] as TableRoundController;
    // Removing only the screen leaves the root RoundProvider/controller alive.
    screen.rerender(<></>);
    await act(async () => {
      release.resolve();
    });
    await waitFor(() => expect(prepare.mock.results[0]?.type).toBe('return'));
    await expect(prepare.mock.results[0]!.value).rejects.toThrow();
    await expect(actor.confirm(tenantB, 'en')).rejects.toThrow();
    expect(await f.repository.tableRounds.load(f.context, f.principal, f.guard)).toBeNull();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
  } finally {
    release.resolve();
    screen.unmount();
    f.cache.clear();
  }
});
