import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import ReservationAvailabilityScreen from './ReservationAvailabilityScreen';
import ReservationAttemptNotice from './ReservationAttemptNotice';
import {
  reservationUiFixture,
  openReservationRequest,
  fillReservationContact,
} from '../../test/reservationUi';
import { reservationCreatePath } from '../../core/reservationRequest';
it('backgrounding purges unfinished contact input and foreground requires a fresh selection', async () => {
  const f = await reservationUiFixture();
  const view = render(<ReservationAvailabilityScreen />, { wrapper: f.Wrapper });
  try {
    await openReservationRequest(view);
    fillReservationContact(view);
    const changes = jest
      .mocked(AppState.addEventListener)
      .mock.calls.map(([, listener]) => listener);
    act(() => changes.forEach((listener) => listener('background')));
    await waitFor(() => expect(view.queryByLabelText('Email')).toBeNull());
    expect(f.fetcher.mock.calls.some(([url]) => new URL(url).pathname.includes('/create'))).toBe(
      false,
    );
    act(() => changes.forEach((listener) => listener('active')));
    await openReservationRequest(view);
    expect(view.getByLabelText('Email').props.value).toBe('');
    expect(view.getByLabelText('Name').props.value).toBe('');
    expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('logout withdraws the original form and does not expose customer contact to the new guest', async () => {
  const f = await reservationUiFixture(true);
  const view = render(<ReservationAvailabilityScreen />, { wrapper: f.Wrapper });
  try {
    await openReservationRequest(view);
    fillReservationContact(view);
    await act(() => f.sessions.logout());
    f.state.userId = f.sessions.userId;
    f.state.ownerVersion = f.sessions.ownerVersion;
    view.rerender(<ReservationAvailabilityScreen />);
    await waitFor(() => expect(view.queryByLabelText('Email')).toBeNull());
    await openReservationRequest(view);
    expect(view.getByLabelText('Email').props.value).toBe('');
    expect(f.fetcher.mock.calls.some(([url]) => new URL(url).pathname.includes('/create'))).toBe(
      false,
    );
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('stopping an uncertain attempt requires confirmation and persists the decision before dismissing', async () => {
  const f = await reservationUiFixture();
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  f.setOutcome('Cancelled');
  const view = render(<ReservationAttemptNotice />, { wrapper: f.Wrapper });
  try {
    fireEvent.press(await view.findByRole('button', { name: 'Stop pending request' }));
    await view.findByText(
      'Stop an unreceived request. Received reservations keep their current status.',
    );
    expect(f.fetcher).not.toHaveBeenCalled();
    fireEvent.press(view.getAllByRole('button', { name: 'Stop pending request' }).at(-1)!);
    await view.findByText('This reservation request was stopped.');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(f.fetcher.mock.calls[0]![0]).pathname).toBe(
      reservationCreatePath + '/cancel-attempt',
    );
    expect(JSON.parse(f.fetcher.mock.calls[0]![1].body!)).toEqual(f.proof);
    expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
    expect(
      (await f.repository.reservations.load(f.context, f.principal, f.guard))?.resolution?.outcome,
    ).toBe('Cancelled');
    await waitFor(() => expect(view.getByRole('button', { name: 'Done' })).not.toBeDisabled());
    fireEvent.press(view.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(view.queryByText('This reservation request was stopped.')).toBeNull(),
    );
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
