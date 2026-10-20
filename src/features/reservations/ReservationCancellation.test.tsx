import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { reservationCancellationUiFixture as fixture } from '../../test/reservationCancellationUi';
import { reservationCancellationPath } from '../../core/reservationPaths';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import { tenantB } from '../../test/fixtures';
it('reviews fresh booking details inside the same native modal before explicit cancellation, then refreshes the detail', async () => {
  const f = await fixture();
  const view = render(f.view(), { wrapper: f.Wrapper });
  try {
    await view.findByText('Original request');
    const review = await view.findByRole('button', { name: 'Review cancellation' });
    await waitFor(() => expect(review).not.toBeDisabled());
    fireEvent.press(review);
    await view.findByText('Current reviewed request');
    expect(view.queryByText('Original request')).toBeNull();
    expect(view.getByText('4 guests')).toBeTruthy();
    expect(view.getByText('Confirmed')).toBeTruthy();
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(f.fetcher.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/submit'))).toBe(
      false,
    );
    expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Cancel this reservation' }));
    await view.findByText(/This cancellation completed/);
    await view.findByText('Original request');
    const submits = f.fetcher.mock.calls.filter(([url]) =>
      new URL(url).pathname.endsWith('/submit'),
    );
    expect(submits).toHaveLength(1);
    expect(JSON.parse(submits[0]![1].body!)).toEqual(f.prepared.proof);
    const raw = JSON.stringify(
      f.cache
        .getQueryCache()
        .findAll()
        .map((entry) => entry.state.data),
    );
    expect(raw).not.toContain('opaque_cancel-proof');
    expect(raw).not.toContain('Current reviewed request');
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('a known stale review retains its attempt, explains the block and only stops the attempt after confirmation', async () => {
  const f = await fixture();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname.endsWith('/submit')
      ? Promise.resolve(response({}, 409))
      : new URL(url).pathname.endsWith('/cancel-attempt')
        ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }))
        : normal(url, options),
  );
  const view = render(f.view(), { wrapper: f.Wrapper });
  try {
    const review = await view.findByRole('button', { name: 'Review cancellation' });
    await waitFor(() => expect(review).not.toBeDisabled());
    fireEvent.press(review);
    fireEvent.press(await view.findByRole('button', { name: 'Cancel this reservation' }));
    await view.findByText(/The booking changed after your review/);
    expect(view.queryByRole('button', { name: 'Retry original cancellation' })).toBeNull();
    expect(view.getByRole('button', { name: 'Review cancellation' })).toBeDisabled();
    fireEvent.press(view.getByRole('button', { name: 'Stop cancellation attempt' }));
    await view.findByText(/Stop only an unreceived cancellation attempt/);
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(
      f.fetcher.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/cancel-attempt')),
    ).toBe(false);
    fireEvent.press(view.getAllByRole('button', { name: 'Stop cancellation attempt' }).at(-1)!);
    await view.findByText(/This cancellation attempt was stopped/);
    expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toMatchObject({
      resolution: { outcome: 'Cancelled', reservationId: null },
    });
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it.each(['close', 'target'] as const)(
  'withdraws a paused cancellation review after %s without storing or submitting it',
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
      const review = await view.findByRole('button', { name: 'Review cancellation' });
      await waitFor(() => expect(review).not.toBeDisabled());
      fireEvent.press(review);
      await act(async () => {
        await entered.promise;
      });
      if (mode === 'close') view.unmount();
      else view.rerender(f.view(tenantB));
      await act(async () => {
        reply.resolve(f.reply(f.prepared));
      });
      if (mode === 'target') expect(view.queryByText('Current reviewed request')).toBeNull();
      expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
      expect(f.fetcher.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/submit'))).toBe(
        false,
      );
    } finally {
      reply.resolve(response({}, 503));
      view.unmount();
      f.cache.clear();
    }
  },
);
