import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { reservationCancellationUiFixture as fixture } from '../../test/reservationCancellationUi';
import { CustomerReservationController } from '../../core/customerReservationController';
it('recovery after response loss refreshes the exact open detail and removes stale booking status before dismissal', async () => {
  const acknowledgement = jest.spyOn(CustomerReservationController.prototype, 'acknowledge');
  const f = await fixture();
  const normal = f.fetcher.getMockImplementation()!;
  let cancelled = false;
  f.fetcher.mockImplementation((url, options) => {
    if (url.endsWith('/submit')) {
      cancelled = true;
      return Promise.reject(new Error('Lost cancellation response'));
    }
    if (url.endsWith('/recover')) return Promise.resolve(f.reply(f.applied));
    if (new URL(url).pathname === '/api/customer-mobile/reservations/' + f.item.reservationId)
      return Promise.resolve(
        f.reply(
          cancelled
            ? { ...f.item, status: 'Cancelled', specialRequests: 'Canonical cancelled booking' }
            : f.item,
        ),
      );
    return normal(url, options);
  });
  const view = render(f.view(), { wrapper: f.Wrapper });
  try {
    const review = await view.findByRole('button', { name: 'Review cancellation' });
    await waitFor(() => expect(review).not.toBeDisabled());
    fireEvent.press(review);
    fireEvent.press(await view.findByRole('button', { name: 'Cancel this reservation' }));
    await view.findByText(/The cancellation result is unknown/);
    expect(view.queryByRole('button', { name: 'Retry original cancellation' })).toBeNull();
    const check = view.getByRole('button', { name: 'Check reservation request' });
    await waitFor(() => expect(check).not.toBeDisabled());
    fireEvent.press(check);
    await view.findByText('Canonical cancelled booking');
    expect(view.getByText('Cancelled')).toBeTruthy();
    expect(view.queryByText('Awaiting restaurant confirmation')).toBeNull();
    await view.findByText(/This cancellation completed/);
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
    const done = view.getByRole('button', { name: 'Done' });
    await waitFor(() => expect(done).not.toBeDisabled());
    fireEvent.press(done);
    await waitFor(() => expect(acknowledgement).toHaveBeenCalledTimes(1));
    await act(async () => {
      await expect(acknowledgement.mock.results[0]!.value).resolves.toBeNull();
    });
    await waitFor(() => expect(view.queryByRole('button', { name: 'Done' })).toBeNull());
    expect(view.queryByRole('button', { name: 'Review cancellation' })).toBeNull();
    expect(view.getByText('Canonical cancelled booking')).toBeTruthy();
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
