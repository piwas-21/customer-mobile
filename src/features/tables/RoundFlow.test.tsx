import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import BasketScreen from '../basket/BasketScreen';
import RoundAttemptNotice from './RoundAttemptNotice';
import { tableRoundUiFixture } from '../../test/tableRoundUi';
import { tableRoundPath } from '../../core/tableRoundRequest';
import { response } from '../../test/transport';
import { tenantA, tenantB } from '../../test/fixtures';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

it.each([false, true])(
  'reviews frozen table-round money and submits once with no contact, personal points or tender: customer=%s',
  async (customer) => {
    const f = await tableRoundUiFixture(customer);
    const screen = render(<BasketScreen />, { wrapper: f.Wrapper });
    try {
      const review = await screen.findByRole('button', { name: 'Review this table round' });
      await waitFor(() => expect(review).not.toBeDisabled());
      fireEvent.press(review);
      const send = await screen.findByRole('button', { name: 'Send round to the restaurant' });
      expect(screen.getByText('Total: CHF 14.00')).toBeTruthy();
      expect(screen.getByText('Table Garden')).toBeTruthy();
      expect(screen.queryByLabelText('Email')).toBeNull();
      act(() => {
        fireEvent.press(send);
        fireEvent.press(send);
      });
      expect(
        await screen.findByText(
          'This round was added to your table. Refresh the table bill to see its current charges.',
        ),
      ).toBeTruthy();
      expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
      const submit = f.fetcher.mock.calls.find(([url]) => url.endsWith('/submit'))!;
      expect(JSON.parse(submit[1].body!)).toEqual({
        ...f.review.preparation.intent,
        payloadHash: f.prepared.proof.payloadHash,
        ownerProof: f.prepared.proof.ownerProof,
      });
      expect(submit[1].headers?.['X-Table-Participant']).toBe('A'.repeat(43));
      const cached = JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      );
      expect(cached).not.toContain(f.prepared.proof.ownerProof);
      expect(cached).toContain(f.request.basket.purchaseFingerprint);
      expect(cached).not.toContain(JSON.stringify(f.request.visit.identity.participantToken));
      expect(cached).not.toContain('participantToken');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).not.toBeDisabled());
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      await waitFor(async () =>
        expect(await f.repository.tableRounds.load(f.context, f.principal, f.guard)).toBeNull(),
      );
    } finally {
      screen.unmount();
      f.cache.clear();
    }
  },
);
it('a lost initial response keeps the original hold and exposes explicit check and stop without a submit retry', async () => {
  const f = await tableRoundUiFixture();
  const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/submit')) throw new Error('Lost response');
    if (url.endsWith('/recover') || url.endsWith('/cancel-attempt'))
      return response({
        success: true,
        data: {
          schemaVersion: 1,
          operationId: tenantB,
          serviceSessionId: tenantA,
          outcome: url.endsWith('/recover') ? 'Unseen' : 'Cancelled',
          orderId: null,
        },
      });
    return normal(url, options);
  });
  const screen = render(<BasketScreen />, { wrapper: f.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review this table round' })).not.toBeDisabled(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Review this table round' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Send round to the restaurant' }));
    const check = await screen.findByRole('button', { name: 'Check this round' });
    await waitFor(() => expect(check).not.toBeDisabled());
    fireEvent.press(check);
    await waitFor(() =>
      expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/recover'))).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Stop the unreceived attempt' }),
      ).not.toBeDisabled(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Stop the unreceived attempt' }));
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/cancel-attempt'))).toBe(false);
    fireEvent.press(await screen.findByRole('button', { name: 'Confirm stop for this attempt' }));
    expect(
      await screen.findByText('This attempt was stopped before a round was added.'),
    ).toBeTruthy();
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
    expect(f.createId).toHaveBeenCalledTimes(1);
  } finally {
    screen.unmount();
    f.cache.clear();
  }
});
it('restores only minimal pending state without network and keeps recovery visible after table capability withdrawal', async () => {
  const f = await tableRoundUiFixture(true, true);
  f.request.bootstrap.capabilities['table-visits'] = 'disabled';
  f.fetcher.mockClear();
  const screen = render(<RoundAttemptNotice />, { wrapper: f.Wrapper });
  try {
    const check = await screen.findByRole('button', { name: 'Check this round' });
    expect(f.fetcher.mock.calls.some(([url]) => url.includes(tableRoundPath))).toBe(false);
    fireEvent.press(check);
    expect(
      await screen.findByText(
        'This round was added to your table. Refresh the table bill to see its current charges.',
      ),
    ).toBeTruthy();
    expect(
      f.fetcher.mock.calls
        .filter(([url]) => url.includes(tableRoundPath))
        .map(([url]) => new URL(url).pathname),
    ).toEqual([tableRoundPath + '/recover']);
  } finally {
    screen.unmount();
    f.cache.clear();
  }
});
