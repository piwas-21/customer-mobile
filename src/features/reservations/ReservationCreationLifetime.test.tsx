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
import { CustomerReservationController } from '../../core/customerReservationController';
import { deferred } from '../../test/deferred';
import { response } from '../../test/transport';
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

it('shows the original-customer reminder after rejected renewal and cannot silently offer a new guest booking', async () => {
  const f = await reservationUiFixture(true);
  await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockResolvedValue(response({}, 401));
  await expect(f.controller().recover('en')).rejects.toThrow();
  expect(f.sessions.needsPaymentAttention).toBe(true);
  f.state.userId = f.sessions.userId;
  f.state.ownerVersion = f.sessions.ownerVersion;
  f.state.needsPaymentAttention = f.sessions.needsPaymentAttention;
  f.fetcher.mockImplementation(normal);
  const view = render(<ReservationAvailabilityScreen />, { wrapper: f.Wrapper });
  try {
    await view.findByText(
      /An earlier order, payment, cancellation or reservation request needs confirmation/,
    );
    fireEvent.press(view.getByRole('button', { name: 'Check available times' }));
    expect(await view.findByRole('button', { name: 'Choose 6:00 PM' })).toBeDisabled();
    fireEvent.press(view.getByRole('button', { name: 'Use this device for another customer' }));
    await view.findByText(
      /The previous customer’s order, payment, cancellation or reservation request may still complete/,
    );
    expect(f.sessions.needsPaymentAttention).toBe(true);
    expect((await f.repository.reservations.load(f.context, f.principal, f.guard))?.proof).toEqual(
      f.proof,
    );
    expect(await f.repository.reservations.intent(f.context, f.principal, f.guard)).toBeNull();
  } finally {
    view.unmount();
    f.cache.clear();
  }
});

it.each([false, true])(
  'backgrounding a paused original check prevents its dispatch: customer=%p',
  async (customer) => {
    const f = await reservationUiFixture(customer);
    await f.repository.reservations.install(f.context, f.prepared, f.proof, f.guard);
    const entered = deferred<void>();
    const release = deferred<void>();
    const checkOriginal = jest.spyOn(CustomerReservationController.prototype, 'recover');
    const read = f.repository.vault.capability.bind(f.repository.vault);
    jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
      if (args[1] === 'reservation-operation') {
        entered.resolve();
        await release.promise;
      }
      return read(...args);
    });
    const view = render(<ReservationAttemptNotice />, { wrapper: f.Wrapper });
    try {
      const check = await view.findByRole('button', { name: 'Check reservation request' });
      await waitFor(() => expect(check).not.toBeDisabled());
      fireEvent.press(check);
      await entered.promise;
      expect(checkOriginal).toHaveBeenCalledTimes(1);
      const result = checkOriginal.mock.results[0];
      if (result?.type !== 'return') throw new Error('Original check did not start');
      const completed = result.value.catch(() => undefined);
      const listeners = jest
        .mocked(AppState.addEventListener)
        .mock.calls.map(([, listener]) => listener);
      await act(async () => {
        listeners.forEach((listener) => listener('background'));
        release.resolve();
        await completed;
      });
      expect(view.queryByRole('button', { name: 'Check reservation request' })).toBeNull();
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(
        (await f.repository.reservations.load(f.context, f.principal, f.guard))?.resolution,
      ).toBeNull();
    } finally {
      release.resolve();
      view.unmount();
      f.cache.clear();
    }
  },
);
