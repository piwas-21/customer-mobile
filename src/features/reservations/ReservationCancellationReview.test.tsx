import '../../i18n';
import '../../test/reservationUiSetup';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { reservationCancellationUiFixture as fixture } from '../../test/reservationCancellationUi';
import useReservationCancellation from './useReservationCancellation';
import { reservationCancellationPath } from '../../core/reservationPaths';
import { tenantB } from '../../test/fixtures';
it('a retained A confirmation or Back callback cannot submit or discard the newer reviewed B action', async () => {
  const f = await fixture();
  jest
    .mocked(randomUUID)
    .mockReturnValueOnce('da96aa10-cc71-481a-b282-9b4bdc535626')
    .mockReturnValueOnce(tenantB);
  const normal = f.fetcher.getMockImplementation()!;
  let preparations = 0;
  const second = {
    ...f.prepared,
    proof: { ...f.prepared.proof, operationId: tenantB },
    reservation: { ...f.prepared.reservation, specialRequests: 'Second reviewed booking' },
  };
  f.fetcher.mockImplementation((url, options) =>
    new URL(url).pathname === reservationCancellationPath + '/prepare'
      ? Promise.resolve(f.reply(++preparations === 1 ? f.prepared : second))
      : normal(url, options),
  );
  const view = renderHook(() => useReservationCancellation(f.item.reservationId), {
    wrapper: f.Wrapper,
  });
  try {
    await waitFor(() =>
      expect(view.result.current.available && !view.result.current.blocked).toBe(true),
    );
    await act(() => view.result.current.prepare());
    expect(view.result.current.review?.operationId).toBe(f.proof.operationId);
    const oldConfirm = view.result.current.confirm;
    const oldDismiss = view.result.current.dismiss;
    act(() => view.result.current.dismiss());
    await act(() => view.result.current.prepare());
    expect(view.result.current.review?.operationId).toBe(tenantB);
    await act(oldConfirm);
    act(oldDismiss);
    expect(view.result.current.review?.operationId).toBe(tenantB);
    expect(view.result.current.review?.reservation.specialRequests).toBe('Second reviewed booking');
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    expect(await f.repository.reservations.load(f.context, f.principal, f.guard)).toBeNull();
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
