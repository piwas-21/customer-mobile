import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { setReservationUiRepository } from './reservationUiSetup';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import ReservationProvider from '../features/reservations/ReservationProvider';
import useBootstrap from '../features/restaurant/useBootstrap';
import { reservationCreatePath } from '../core/reservationRequest';
import { reservationControllerFixture } from './reservationController';
import { mockWorkspaceOwner } from './workspaceOwner';
export function reservationForms() {
  return [
    {
      formKey: 'reservation',
      fields: ['customerName', 'customerEmail', 'customerPhone', 'specialRequests'].map(
        (fieldKey, displayOrder) => ({
          fieldKey,
          displayOrder,
          isLocked: displayOrder < 2,
          isRequired: displayOrder < 2,
          isVisible: true,
        }),
      ),
    },
  ];
}
export async function reservationUiFixture(customer = false) {
  const f = await reservationControllerFixture(customer);
  setReservationUiRepository(f.repository);
  const state = mockWorkspaceOwner(f);
  const bootstrap = { data: f.bootstrap, isPending: false } as ReturnType<typeof useBootstrap>;
  jest.mocked(useBootstrap).mockReturnValue(bootstrap);
  jest
    .mocked(randomUUID)
    .mockReturnValueOnce(f.proof.operationId)
    .mockReturnValueOnce(f.prepared.sessionId);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let outcome: 'Applied' | 'Cancelled' | 'Unseen' | 'network' = 'Applied';
  f.fetcher.mockImplementation((url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/bootstrap')) return Promise.resolve(f.reply(f.bootstrap));
    if (parsed.pathname === '/api/FormFieldConfiguration')
      return Promise.resolve(f.reply(reservationForms()));
    if (parsed.pathname.endsWith('/availability'))
      return Promise.resolve(
        f.reply({
          schemaVersion: 1,
          date: parsed.searchParams.get('date'),
          numberOfGuests: Number(parsed.searchParams.get('numberOfGuests')),
          timeZone: f.bootstrap.timezone,
          slots: [{ startTime: f.input.startTime, endTime: f.input.endTime }],
        }),
      );
    if (parsed.pathname === reservationCreatePath + '/prepare')
      return Promise.resolve(f.reply(f.proof));
    if (outcome === 'network') return Promise.reject(new Error('Injected response loss'));
    return Promise.resolve(
      f.reply({
        ...f.applied,
        outcome,
        reservationId: outcome === 'Applied' ? f.applied.reservationId : null,
      }),
    );
  });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={cache}>
        <ReservationProvider>{children}</ReservationProvider>
      </QueryClientProvider>
    );
  }
  return {
    ...f,
    state,
    cache,
    Wrapper,
    bootstrap,
    setOutcome: (next: typeof outcome) => {
      outcome = next;
    },
  };
}

export async function openReservationRequest(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByRole('button', { name: 'Check available times' }));
  const select = await view.findByRole('button', { name: 'Choose 6:00 PM' });
  await waitFor(() => expect(select).not.toBeDisabled());
  fireEvent.press(select);
  await view.findByLabelText('Name');
}
export function fillReservationContact(view: ReturnType<typeof render>) {
  fireEvent.changeText(view.getByLabelText('Name'), 'Native guest');
  fireEvent.changeText(view.getByLabelText('Email'), 'guest@example.test');
}
