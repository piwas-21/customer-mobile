import { setReservationUiRepository as install } from '../../test/reservationUiSetup';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { tableVisitUiFixture as fixture } from '../../test/tableVisitUi';
import { tableAdmissionInbox } from '../../core/tableAdmissionInbox';
import { tenantA, tenantB } from '../../test/fixtures';
import { tableAccount } from '../../test/tableAccount';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import useBootstrap from '../restaurant/useBootstrap';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
afterEach(() => tableAdmissionInbox.clear());
it.each(['background', 'owner', 'tenant', 'capability'])(
  'withdraws a paused private bill before a late response can display it: %s',
  async (mode) => {
    const release = deferred<Response>();
    const f = await fixture(install, true, (setup) => {
      const normal = setup.fetcher.getMockImplementation()!;
      setup.fetcher.mockImplementation((url, options) =>
        url.endsWith('/account') ? release.promise : normal(url, options),
      );
    });
    try {
      await waitFor(() =>
        expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/account'))).toBe(true),
      );
      if (mode === 'background') {
        act(() =>
          jest.mocked(AppState.addEventListener).mock.calls.forEach(([, fn]) => fn('background')),
        );
      } else if (mode === 'owner') {
        await act(async () => f.controller.logout());
        f.state.ownerVersion = f.controller.ownerVersion;
        f.rerender();
      } else if (mode === 'tenant') {
        act(() => f.boundary.select(tenantB));
        f.state.ownerVersion = 'withdrawn-tenant';
        f.rerender();
      } else {
        jest.mocked(useBootstrap).mockReturnValue({
          ...f.bootstrapQuery,
          data: { ...f.bootstrap, capabilities: { 'table-visits': 'disabled' } },
        });
        f.rerender();
      }
      await act(async () => release.resolve(response({ success: true, data: tableAccount() })));
      expect(f.screen.queryByText('Current total: CHF 5.00')).toBeNull();
      expect(f.screen.queryByText('3 × Meal')).toBeNull();
      expect(f.fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
    } finally {
      release.resolve(response({}, 503));
      f.close();
    }
  },
);
it('does not revive a displayed join confirmation after capability disable/re-enable', async () => {
  tableAdmissionInbox.receive(tenantA, 'physical-qr');
  const f = await fixture(install);
  try {
    await f.screen.findByRole('button', { name: 'Join table' });
    jest.mocked(useBootstrap).mockReturnValue({
      ...f.bootstrapQuery,
      data: { ...f.bootstrap, capabilities: { 'table-visits': 'disabled' } },
    });
    f.rerender();
    expect(f.screen.queryByRole('button', { name: 'Join table' })).toBeNull();
    jest.mocked(useBootstrap).mockReturnValue(f.bootstrapQuery);
    f.rerender();
    await f.screen.findByText('Scan the code at your table to see its current bill.');
    expect(f.screen.queryByRole('button', { name: 'Join table' })).toBeNull();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
  } finally {
    f.close();
  }
});
it('drops a displayed review when another capture clears its private handoff', async () => {
  tableAdmissionInbox.receive(tenantA, 'old-physical-qr');
  const f = await fixture(install);
  try {
    const confirm = await f.screen.findByRole('button', { name: 'Join table' });
    act(() => tableAdmissionInbox.clear());
    fireEvent.press(confirm);
    await waitFor(() => expect(f.screen.queryByRole('button', { name: 'Join table' })).toBeNull());
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
  } finally {
    f.close();
  }
});
