import { setReservationUiRepository as install } from '../../test/reservationUiSetup';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { tableVisitUiFixture as fixture } from '../../test/tableVisitUi';
import { tableAdmissionInbox } from '../../core/tableAdmissionInbox';
import { tenantA } from '../../test/fixtures';
import { tableIdentity, tableAccount } from '../../test/tableAccount';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
afterEach(() => {
  tableAdmissionInbox.take(tenantA);
  jest.restoreAllMocks();
});
it('reviews one scanned QR, acknowledges one admission and displays current and original bill values without leaking authority', async () => {
  tableAdmissionInbox.receive(tenantA, 'physical-table-qr');
  const f = await fixture(install);
  try {
    const join = await f.screen.findByRole('button', { name: 'Join table' });
    expect(f.screen.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
    act(() => {
      fireEvent.press(join);
      fireEvent.press(join);
    });
    expect(await f.screen.findByText('Current total: CHF 5.00')).toBeTruthy();
    for (const text of [
      'Original amount: CHF 15.00',
      'Bill adjustment: CHF 10.00',
      'Still to pay: CHF 3.00',
      'Order total: CHF 5.00',
      '3 × Meal',
      'CHF 10.00',
    ])
      expect(f.screen.getByText(text)).toBeTruthy();
    expect(f.screen.queryByText('CHF 9.99')).toBeNull();
    expect(f.screen.queryByRole('button', { name: /pay|place order|send round/i })).toBeNull();
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/join'))).toHaveLength(1);
    const cached = JSON.stringify(
      f.cache
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).not.toContain(tableIdentity.participantToken);
    expect(cached).not.toContain('physical-table-qr');
  } finally {
    f.close();
  }
});
it('requires explicit local leaving and removes device access without another server write', async () => {
  const f = await fixture(install, true);
  try {
    await f.screen.findByText('Current total: CHF 5.00');
    fireEvent.press(f.screen.getByRole('button', { name: 'Leave table on this device' }));
    expect(f.screen.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    expect(
      f.screen.getByText(
        'Your bill stays with the restaurant. This removes access from this device.',
      ),
    ).toBeTruthy();
    await act(async () =>
      fireEvent.press(f.screen.getByRole('button', { name: 'Remove table access' })),
    );
    expect(
      await f.screen.findByText('Scan the code at your table to see its current bill.'),
    ).toBeTruthy();
    expect(f.screen.queryByText('Current total: CHF 5.00')).toBeNull();
    expect(f.fetcher.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
  } finally {
    f.close();
  }
});
it('hides the prior bill during a failed explicit refresh while retaining original participant access', async () => {
  const f = await fixture(install, true);
  try {
    await f.screen.findByText('Current total: CHF 5.00');
    const entered = deferred<void>();
    const release = deferred<Response>();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((url, options) => {
      if (url.endsWith('/account')) {
        entered.resolve();
        return release.promise;
      }
      return normal(url, options);
    });
    fireEvent.press(f.screen.getByRole('button', { name: 'Refresh table access and bill' }));
    await act(async () => entered.promise);
    expect(f.screen.queryByText('Current total: CHF 5.00')).toBeNull();
    await act(async () => release.resolve(response({}, 503)));
    expect(
      await f.screen.findByText(
        'The current bill could not be confirmed. Refresh or ask the restaurant.',
      ),
    ).toBeTruthy();
    expect(await f.repository.tableVisits.read(f.context, f.principal, () => {})).not.toBeNull();
    f.fetcher.mockImplementation(normal);
    await act(async () =>
      fireEvent.press(f.screen.getByRole('button', { name: 'Refresh table access and bill' })),
    );
    expect(await f.screen.findByText('Current total: CHF 5.00')).toBeTruthy();
  } finally {
    f.close();
  }
});
it('does not invent a currency or financial total when an authorized legacy account has no currency', async () => {
  const f = await fixture(install, true);
  try {
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((url, options) =>
      url.endsWith('/account')
        ? Promise.resolve(response({ success: true, data: { ...tableAccount(), currency: null } }))
        : normal(url, options),
    );
    expect(
      await f.screen.findByText(
        'Amounts are unavailable. Ask the restaurant to confirm your bill.',
      ),
    ).toBeTruthy();
    expect(f.screen.queryByText(/Current total:/)).toBeNull();
  } finally {
    f.close();
  }
});
it('drops a paused QR review after the same account receives a new owner revision', async () => {
  tableAdmissionInbox.receive(tenantA, 'private-qr');
  const entered = deferred<void>();
  const release = deferred<Response>();
  const f = await fixture(install, false, (setup) => {
    const normal = setup.fetcher.getMockImplementation()!;
    setup.fetcher.mockImplementation((url, options) => {
      if (url.includes('/bootstrap?')) {
        entered.resolve();
        return release.promise;
      }
      return normal(url, options);
    });
  });
  try {
    await waitFor(() =>
      expect(f.fetcher.mock.calls.some(([url]) => url.includes('/bootstrap?'))).toBe(true),
    );
    f.state.ownerVersion = 'new-owner';
    f.rerender();
    await act(async () => release.resolve(response({ success: true, data: f.bootstrap })));
    await waitFor(() => expect(f.screen.queryByRole('button', { name: 'Join table' })).toBeNull());
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/join'))).toBe(false);
    expect(
      JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('private-qr');
  } finally {
    f.close();
  }
});
