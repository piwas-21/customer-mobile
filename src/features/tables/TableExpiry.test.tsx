import { setReservationUiRepository as install } from '../../test/reservationUiSetup';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { tableVisitUiFixture as fixture } from '../../test/tableVisitUi';
import { tableVisitRecord } from '../../test/tableAccount';
import { secretKey } from '../../core/credentials';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
it('withdraws a displayed private bill at participant expiry without refresh or AppState change, preserving local leaving', async () => {
  jest.restoreAllMocks();
  jest.useFakeTimers();
  const now = Date.parse('2030-05-17T14:00:00Z');
  jest.setSystemTime(now);
  const expiresAt = new Date(now + 30_000).toISOString();
  const f = await fixture(install, true, (setup) => {
    const record = tableVisitRecord();
    record.identity.expiresAt = expiresAt;
    setup.store.values.set(
      secretKey(setup.context, 'table-participant', setup.principal),
      JSON.stringify(record),
    );
  });
  try {
    await f.screen.findByText('Current total: CHF 5.00');
    const requests = f.fetcher.mock.calls.length;
    act(() => jest.advanceTimersByTime(Date.parse(expiresAt) - Date.now() - 1));
    expect(f.screen.queryByText('Current total: CHF 5.00')).not.toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(Date.now()).toBe(Date.parse(expiresAt));
    expect(
      f.cache
        .getQueryCache()
        .getAll()
        .find((query) => query.queryKey.includes('access'))?.state.data,
    ).toMatchObject({ expired: true });
    await waitFor(() => expect(f.screen.queryByText('Current total: CHF 5.00')).toBeNull());
    expect(
      f.screen.getByText(
        'This saved table access has expired. Leave it on this device before scanning again.',
      ),
    ).toBeTruthy();
    const cached = f.cache.getQueryCache().getAll();
    expect(
      cached
        .filter((query) => query.queryKey.includes('account'))
        .every((query) => query.state.data === undefined),
    ).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(requests);
    expect(
      (await f.repository.tableVisits.read(f.context, f.principal, () => {}))?.identity.expiresAt,
    ).toBe(expiresAt);
    fireEvent.press(f.screen.getByRole('button', { name: 'Leave table on this device' }));
    await act(async () =>
      fireEvent.press(f.screen.getByRole('button', { name: 'Remove table access' })),
    );
    expect(await f.repository.tableVisits.read(f.context, f.principal, () => {})).toBeNull();
  } finally {
    f.close();
    jest.useRealTimers();
  }
});
