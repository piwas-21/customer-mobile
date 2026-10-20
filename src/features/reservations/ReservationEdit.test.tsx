import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import {
  reservationEditUiFixture as fixture,
  openReservationEditor,
} from '../../test/reservationEditUi';
import { reservationEditPath } from '../../core/reservationPaths';
import { deferred } from '../../test/deferred';
import { response } from '../../test/transport';
import { tenantB } from '../../test/fixtures';
it('reviews fresh contact privately, preserves hidden existing fields, and confirms inside one replacing native modal', async () => {
  const f = await fixture(true);
  const view = render(f.view(), { wrapper: f.Wrapper });
  try {
    await openReservationEditor(view);
    expect(view.getByLabelText('Phone (optional)')).toHaveDisplayValue(f.contact.customerPhone);
    expect(view.getByLabelText('Special requests (optional)')).toHaveDisplayValue(
      'Existing instructions',
    );
    fireEvent.changeText(view.getByLabelText('Name'), 'Corrected customer');
    fireEvent.press(view.getByRole('button', { name: 'Review booking changes' }));
    await view.findByRole('button', { name: 'Send these changes' });
    expect(view.getByText('Name: Corrected customer')).toBeTruthy();
    expect(view.getByText('Email: existing@example.test')).toBeTruthy();
    expect(view.getByText('Current booking')).toBeTruthy();
    expect(view.getByText('Your proposed booking')).toBeTruthy();
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    fireEvent.press(view.getByRole('button', { name: 'Send these changes' }));
    await view.findByText(/The restaurant received your booking changes/);
    const calls = f.fetcher.mock.calls.filter(
      ([url]) => new URL(url).pathname === reservationEditPath + '/submit',
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]![1].body!)).toMatchObject({
      reservationId: f.item.reservationId,
      customerName: 'Corrected customer',
      customerEmail: f.contact.customerEmail,
      customerPhone: f.contact.customerPhone,
      specialRequests: 'Existing instructions',
    });
    const cache = JSON.stringify(
      f.cache
        .getQueryCache()
        .findAll()
        .map((entry) => entry.state.data),
    );
    for (const secret of [
      'Corrected customer',
      'existing@example.test',
      '+41000000001',
      'protected_edit_review',
    ])
      expect(cache).not.toContain(secret);
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('uses only owned advisory times after a party change and reviews renewed restaurant approval', async () => {
  const f = await fixture();
  const view = render(f.view(), { wrapper: f.Wrapper });
  try {
    await openReservationEditor(view);
    fireEvent.press(view.getByRole('button', { name: 'Decrease Number of guests' }));
    expect(view.getByRole('button', { name: 'Review booking changes' })).toBeDisabled();
    fireEvent.press(view.getByRole('button', { name: 'Check available times' }));
    const choose = await view.findByRole('button', { name: 'Choose 8:00 PM–10:00 PM' });
    fireEvent.press(choose);
    f.review.proposed.numberOfGuests = 5;
    f.review.proposed.startTime = '20:00:00';
    f.review.proposed.endTime = '22:00:00';
    f.review.proposed.status = 'Pending';
    fireEvent.press(view.getByRole('button', { name: 'Review booking changes' }));
    await view.findByRole('button', { name: 'Send these changes' });
    expect(view.getByText('Awaiting restaurant confirmation')).toBeTruthy();
    const request = f.fetcher.mock.calls.find(([url]) =>
      new URL(url).pathname.endsWith('/availability'),
    )!;
    expect(new URL(request[0]).pathname).toBe(
      '/api/customer-mobile/reservations/' + f.item.reservationId + '/availability',
    );
    expect(request[1].headers?.Authorization).toBe('Bearer access');
    expect(new URL(request[0]).searchParams.get('numberOfGuests')).toBe('5');
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('unknown submission leaves one original edit with check/stop controls and no resend action', async () => {
  const f = await fixture();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    url.endsWith('/submit')
      ? Promise.reject(new Error('Lost response'))
      : url.endsWith('/recover')
        ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Unseen', reservationId: null }))
        : url.endsWith('/cancel-attempt')
          ? Promise.resolve(f.reply({ ...f.applied, outcome: 'Cancelled', reservationId: null }))
          : normal(url, options),
  );
  const view = render(f.view(), { wrapper: f.Wrapper });
  try {
    await openReservationEditor(view);
    fireEvent.press(view.getByRole('button', { name: 'Review booking changes' }));
    fireEvent.press(await view.findByRole('button', { name: 'Send these changes' }));
    await view.findByText(/This booking change is unresolved/);
    expect(view.queryByRole('button', { name: 'Send original request again' })).toBeNull();
    expect(view.getByRole('button', { name: 'Change reservation' })).toBeDisabled();
    fireEvent.press(view.getByRole('button', { name: 'Check reservation request' }));
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Stop this unreceived change' })).not.toBeDisabled(),
    );
    fireEvent.press(view.getByRole('button', { name: 'Stop this unreceived change' }));
    await view.findByText(/This stops only this change/);
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    fireEvent.press(view.getAllByRole('button', { name: 'Stop this unreceived change' }).at(-1)!);
    await view.findByText(/This unreceived booking change was stopped/);
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it.each(['close', 'target'] as const)(
  'hides a private editor result arriving after %s without caching or preparing it',
  async (mode) => {
    const f = await fixture();
    const normal = f.fetcher.getMockImplementation()!;
    const entered = deferred<void>();
    const reply = deferred<Response>();
    f.fetcher.mockImplementation((url, options) => {
      if (!new URL(url).pathname.endsWith('/edit')) return normal(url, options);
      entered.resolve();
      return reply.promise;
    });
    const view = render(f.view(), { wrapper: f.Wrapper });
    try {
      const edit = await view.findByRole('button', { name: 'Change reservation' });
      await waitFor(() => expect(edit).not.toBeDisabled());
      fireEvent.press(edit);
      await act(() => entered.promise);
      if (mode === 'close') view.unmount();
      else view.rerender(f.view(tenantB));
      await act(() => {
        reply.resolve(f.reply(f.editContext));
      });
      if (mode === 'target') expect(view.queryByDisplayValue('existing@example.test')).toBeNull();
      expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/prepare'))).toBe(false);
      expect(
        JSON.stringify(
          f.cache
            .getQueryCache()
            .findAll()
            .map((entry) => entry.state.data),
        ),
      ).not.toContain('existing@example.test');
    } finally {
      reply.resolve(response({}, 503));
      view.unmount();
      f.cache.clear();
    }
  },
);

it('returns from the native date picker without losing private contact and validates fields before preparing', async () => {
  const f = await fixture();
  const view = render(f.view(), { wrapper: f.Wrapper });
  try {
    await openReservationEditor(view);
    fireEvent.changeText(view.getByLabelText('Name'), 'Retained contact');
    fireEvent.press(view.getByRole('button', { name: /^Date:/ }));
    await view.findByRole('button', { name: 'Use this date' });
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    fireEvent.press(view.getByRole('button', { name: 'Close' }));
    expect(await view.findByLabelText('Name')).toHaveDisplayValue('Retained contact');
    fireEvent.changeText(view.getByLabelText('Email'), 'invalid');
    fireEvent.press(view.getByRole('button', { name: 'Review booking changes' }));
    expect(await view.findByText('Check this field.')).toBeTruthy();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/prepare'))).toBe(false);
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
