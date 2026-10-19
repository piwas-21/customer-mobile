import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import AccountDeletionModal from './AccountDeletionModal';
import { sessionSetup } from '../../test/sessions';
import { customerProfile } from '../../test/customerProfile';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import '../../i18n';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
const notRequested = { schemaVersion: 1, state: 'not-requested', scheduledAtUtc: null };
const scheduled = { schemaVersion: 1, state: 'scheduled', scheduledAtUtc: '2026-11-18T13:20:00Z' };
async function setup(initial = notRequested) {
  const fixture = await sessionSetup();
  fixture.fetcher.mockResolvedValue(response({ success: true, data: initial }));
  const close = jest.fn();
  const logout = jest.fn<Promise<void>, []>().mockResolvedValue();
  const screen = render(
    <AccountDeletionModal
      profile={customerProfile}
      controller={fixture.controller}
      restaurant="Alpha"
      onClose={close}
      logout={logout}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Request account deletion' })).toBeTruthy(),
  );
  return { ...fixture, screen, close, logout };
}
it('names the restaurant/account, discloses retention and timing, and needs an explicit decision', async () => {
  const fixture = await setup();
  try {
    expect(fixture.screen.getByText('Delete your account at Alpha?')).toBeTruthy();
    expect(fixture.screen.getByText(new RegExp(customerProfile.email))).toBeTruthy();
    expect(fixture.screen.getByText(/30 days after your first request/)).toBeTruthy();
    expect(fixture.screen.getByText(/financial records required for accounting/)).toBeTruthy();
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Keep my account' }));
    expect(fixture.close).toHaveBeenCalledTimes(1);
    expect(fixture.fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    fixture.fetcher.mockResolvedValue(response({ success: true, data: scheduled }));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Request account deletion' }));
    await waitFor(() =>
      expect(fixture.screen.getByText(/Account deletion is scheduled for/)).toBeTruthy(),
    );
    expect(fixture.screen.queryByRole('button', { name: 'Request account deletion' })).toBeNull();
    expect(fixture.screen.getByText(/Your scheduled date still applies/)).toBeTruthy();
    fireEvent.press(
      fixture.screen.getByRole('button', { name: 'Sign out and keep deletion scheduled' }),
    );
    expect(fixture.logout).toHaveBeenCalledTimes(1);
  } finally {
    fixture.screen.unmount();
  }
});
it('holds unknown outcomes for a read-only check, blocks duplicate presses and modal dismissal while busy', async () => {
  const fixture = await setup();
  const finish = deferred<Response>();
  try {
    fixture.fetcher.mockReturnValueOnce(finish.promise);
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Request account deletion' }));
    fireEvent(fixture.screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(fixture.close).not.toHaveBeenCalled();
    finish.resolve(response({}, 503));
    await waitFor(() =>
      expect(fixture.screen.getByText(/We could not confirm the result/)).toBeTruthy(),
    );
    expect(fixture.screen.queryByRole('button', { name: 'Request account deletion' })).toBeNull();
    fixture.fetcher.mockResolvedValue(response({ success: true, data: scheduled }));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Check deletion status' }));
    await waitFor(() =>
      expect(fixture.screen.getByText(/Account deletion is scheduled for/)).toBeTruthy(),
    );
    expect(fixture.fetcher.mock.calls.map(([, options]) => options.method)).toEqual([
      'GET',
      'POST',
      'GET',
    ]);
  } finally {
    finish.resolve(response({}, 503));
    fixture.screen.unmount();
  }
});
it('withdraws a previously confirmed date if the next status check fails', async () => {
  const fixture = await setup();
  try {
    fixture.fetcher.mockResolvedValueOnce(response({ success: true, data: scheduled }));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Request account deletion' }));
    await waitFor(() =>
      expect(fixture.screen.getByText(/Account deletion is scheduled for/)).toBeTruthy(),
    );
    fixture.fetcher.mockResolvedValue(response({}, 503));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Check deletion status' }));
    await waitFor(() =>
      expect(fixture.screen.getByText(/Deletion status is unavailable/)).toBeTruthy(),
    );
    expect(fixture.screen.queryByText(/Account deletion is scheduled for/)).toBeNull();
    expect(fixture.screen.queryByRole('button', { name: 'Request account deletion' })).toBeNull();
  } finally {
    fixture.screen.unmount();
  }
});
it('does not expose a late deletion result after logout', async () => {
  const fixture = await setup();
  const finish = deferred<Response>();
  try {
    fixture.fetcher.mockReturnValueOnce(finish.promise);
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Request account deletion' }));
    await act(async () => {
      await fixture.controller.logout();
      finish.resolve(response({ success: true, data: scheduled }));
    });
    await waitFor(() =>
      expect(fixture.screen.getByText(/We could not confirm the result/)).toBeTruthy(),
    );
    expect(fixture.screen.queryByText(/Account deletion is scheduled for/)).toBeNull();
  } finally {
    finish.resolve(response({}, 503));
    fixture.screen.unmount();
  }
});
