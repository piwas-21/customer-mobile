import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ReservationAvailabilityScreen from './ReservationAvailabilityScreen';
import ReservationAttemptNotice from './ReservationAttemptNotice';
import {
  reservationUiFixture,
  openReservationRequest as openRequest,
  fillReservationContact as fill,
} from '../../test/reservationUi';
import { reservationCreatePath } from '../../core/reservationRequest';
it.each([false, true])(
  'requests a reservation once and shows received separately from restaurant confirmation: customer=%p',
  async (customer) => {
    const f = await reservationUiFixture(customer);
    const view = render(<ReservationAvailabilityScreen />, { wrapper: f.Wrapper });
    try {
      await openRequest(view);
      fill(view);
      fireEvent.press(view.getByRole('button', { name: 'Request reservation' }));
      await view.findByText(
        'Your request reached the restaurant. The restaurant confirms reservations separately.',
      );
      expect(view.queryByLabelText('Email')).toBeNull();
      expect(
        f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname === reservationCreatePath),
      ).toHaveLength(1);
      const cached = JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((entry) => entry.state.data),
      );
      expect(cached).not.toContain('guest@example.test');
      expect(cached).not.toContain(f.proof.ownerProof);
      expect(cached).not.toContain(f.prepared.sessionId);
      await waitFor(() => expect(view.getByRole('button', { name: 'Done' })).not.toBeDisabled());
      await act(async () => {
        fireEvent.press(view.getByRole('button', { name: 'Done' }));
      });
      expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
      await waitFor(() =>
        expect(
          view.queryByText(
            'Your request reached the restaurant. The restaurant confirms reservations separately.',
          ),
        ).toBeNull(),
      );
    } finally {
      view.unmount();
      f.cache.clear();
    }
  },
);
it('blocks incomplete contact input before preparation and honors configured required phone', async () => {
  const f = await reservationUiFixture();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname === '/api/FormFieldConfiguration'
      ? Promise.resolve(
          f.reply([
            {
              formKey: 'reservation',
              fields: ['customerName', 'customerEmail', 'customerPhone', 'specialRequests'].map(
                (fieldKey, index) => ({
                  fieldKey,
                  displayOrder: index,
                  isLocked: index < 2,
                  isRequired: index < 3,
                  isVisible: true,
                }),
              ),
            },
          ]),
        )
      : normal(url, options),
  );
  const view = render(<ReservationAvailabilityScreen />, { wrapper: f.Wrapper });
  try {
    await openRequest(view);
    fireEvent.press(view.getByRole('button', { name: 'Request reservation' }));
    expect(await view.findAllByText('Check this field.')).toHaveLength(3);
    fill(view);
    fireEvent.press(view.getByRole('button', { name: 'Request reservation' }));
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/create/prepare'))).toBe(false);
    fireEvent.changeText(view.getByLabelText('Phone'), '12345');
    fireEvent.press(view.getByRole('button', { name: 'Request reservation' }));
    await view.findByText(
      'Your request reached the restaurant. The restaurant confirms reservations separately.',
    );
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
it('a lost response survives navigation; Unseen cannot release the attempt and retry requires explicit confirmation', async () => {
  const f = await reservationUiFixture();
  const view = render(<ReservationAvailabilityScreen />, { wrapper: f.Wrapper });
  try {
    await openRequest(view);
    fill(view);
    f.setOutcome('network');
    fireEvent.press(view.getByRole('button', { name: 'Request reservation' }));
    await view.findByText(
      'We have not confirmed whether the restaurant received this request. Check it before making another.',
    );
    view.rerender(<ReservationAttemptNotice />);
    f.setOutcome('Unseen');
    fireEvent.press(view.getByRole('button', { name: 'Check reservation request' }));
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Send original request again' })).not.toBeDisabled(),
    );
    fireEvent.press(view.getByRole('button', { name: 'Send original request again' }));
    await view.findByText(
      'Send the same reservation details again. If they were already received, you will see the existing result.',
    );
    expect(
      f.fetcher.mock.calls.filter(([url]) => new URL(url).pathname === reservationCreatePath),
    ).toHaveLength(1);
    f.setOutcome('Applied');
    fireEvent.press(view.getAllByRole('button', { name: 'Send original request again' }).at(-1)!);
    await view.findByText(
      'Your request reached the restaurant. The restaurant confirms reservations separately.',
    );
    const creates = f.fetcher.mock.calls.filter(
      ([url]) => new URL(url).pathname === reservationCreatePath,
    );
    expect(creates).toHaveLength(2);
    expect(creates[1]![1].body).toBe(creates[0]![1].body);
    expect(creates[1]![1].headers?.['X-Session-Id']).toBe(creates[0]![1].headers?.['X-Session-Id']);
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
