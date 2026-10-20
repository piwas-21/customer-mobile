import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { reservationCancellationUiFixture as fixture } from '../../test/reservationCancellationUi';
import { reservationCancellationPath } from '../../core/reservationPaths';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import useBootstrap from '../restaurant/useBootstrap';
async function withdraw(
  f: Awaited<ReturnType<typeof fixture>>,
  mode: string,
  rerender: () => void,
) {
  if (mode === 'background') {
    act(() =>
      jest
        .mocked(AppState.addEventListener)
        .mock.calls.forEach(([, listener]) => listener('background')),
    );
  } else if (mode === 'owner') {
    await act(() => f.sessions.logout());
    f.state.userId = null;
    f.state.ownerVersion = f.sessions.ownerVersion;
    rerender();
  } else {
    jest.mocked(useBootstrap).mockReturnValue({
      ...f.bootstrap,
      data: {
        ...f.bootstrap.data!,
        capabilities: { ...f.bootstrap.data!.capabilities, reservations: 'disabled' },
      },
    });
    rerender();
  }
}
it.each(['background', 'owner', 'capability'])(
  'withdraws a paused fresh cancellation review on %s without publishing or saving it',
  async (mode) => {
    const f = await fixture();
    const entered = deferred<void>();
    const reply = deferred<Response>();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((url, options) => {
      if (new URL(url).pathname === reservationCancellationPath + '/prepare') {
        entered.resolve();
        return reply.promise;
      }
      return normal(url, options);
    });
    const view = render(f.view(), { wrapper: f.Wrapper });
    try {
      const button = await view.findByRole('button', { name: 'Review cancellation' });
      await waitFor(() => expect(button).not.toBeDisabled());
      fireEvent.press(button);
      await act(async () => {
        await entered.promise;
      });
      await withdraw(f, mode, () => view.rerender(f.view()));
      await act(async () => {
        reply.resolve(f.reply(f.prepared));
      });
      expect(view.queryByText('Current reviewed request')).toBeNull();
      expect(view.queryByRole('button', { name: 'Cancel this reservation' })).toBeNull();
      expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
      expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    } finally {
      reply.resolve(response({}, 503));
      view.unmount();
      f.cache.clear();
    }
  },
);
it.each(['background', 'owner'])(
  'withdraws a paused original cancellation submission on %s before its private headers dispatch',
  async (mode) => {
    const f = await fixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    const view = render(f.view(), { wrapper: f.Wrapper });
    try {
      const button = await view.findByRole('button', { name: 'Review cancellation' });
      await waitFor(() => expect(button).not.toBeDisabled());
      fireEvent.press(button);
      const confirm = await view.findByRole('button', { name: 'Cancel this reservation' });
      const read = f.repository.vault.capability.bind(f.repository.vault);
      jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
        if (args[1] === 'reservation-operation') {
          entered.resolve();
          await release.promise;
        }
        return read(...args);
      });
      fireEvent.press(confirm);
      await act(async () => {
        await entered.promise;
      });
      await withdraw(f, mode, () => view.rerender(f.view()));
      await act(async () => {
        release.resolve();
      });
      expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
      expect(
        (await f.repository.reservations.load(f.context, f.principal, f.guard))?.proof,
      ).toEqual(f.prepared.proof);
      expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
    } finally {
      release.resolve();
      view.unmount();
      f.cache.clear();
    }
  },
);
