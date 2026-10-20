import '../../i18n';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ReceiptModal from './ReceiptModal';
import HistoryReceiptModal from './HistoryReceiptModal';
import CancellationNotice from './CancellationNotice';
import { cancellationUiFixture } from '../../test/cancellationUi';
import type { SessionRepository } from '../../core/sessionRepository';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/useBootstrap');
jest.mock('./ReorderEntry', () => ({ __esModule: true, default: () => null }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
jest.mock('expo-crypto', () => ({ randomUUID: () => '44444444-4444-4444-8444-444444444444' }));
const confirmLabel = 'Yes, decline delay and request cancellation';
it.each(['saved', 'history'] as const)(
  'opens %s receipt confirmation, mutates only after confirmation, and caches no private authority',
  async (entry) => {
    const f = await cancellationUiFixture(entry === 'history');
    mockRepository = f.repository;
    const view = render(
      entry === 'saved' ? (
        <ReceiptModal orders={f.orders} />
      ) : (
        <HistoryReceiptModal
          context={f.context}
          controller={f.sessions}
          userId={f.sessions.userId!}
          ownerVersion={f.sessions.ownerVersion}
          orderId={f.receipt.orderId}
          onBack={jest.fn()}
          onClose={f.close}
        />
      ),
      { wrapper: f.Wrapper },
    );
    try {
      const button = await view.findByRole('button', { name: 'Decline preparation delay' });
      await waitFor(() => expect(button).not.toBeDisabled());
      expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
      fireEvent.press(button);
      const confirm = await view.findByRole('button', { name: confirmLabel });
      expect(view.getByRole('button', { name: 'Keep order and return to receipt' })).toBeTruthy();
      expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
      fireEvent.press(confirm);
      await view.findByText(
        'The restaurant confirmed cancellation of this order. No refund was issued by this action.',
      );
      const submits = f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'));
      expect(submits).toHaveLength(1);
      expect(new URL(submits[0]![0]).pathname).toBe(
        `/api/customer-mobile/orders/cancellation/${entry === 'saved' ? 'original/' : ''}submit`,
      );
      const cached = JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      );
      expect(cached).not.toMatch(/payloadHash|accessToken|sessionId|expectedVersion/);
      fireEvent.press(view.getByRole('button', { name: 'Close' }));
      expect(f.close).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      f.cache.clear();
    }
  },
);

it('keeps an ambiguous cancellation visible after closing and requires separate confirmation for the exact retry', async () => {
  const f = await cancellationUiFixture();
  mockRepository = f.repository;
  const view = render(<ReceiptModal orders={f.orders} />, { wrapper: f.Wrapper });
  try {
    const entry = await view.findByRole('button', { name: 'Decline preparation delay' });
    await waitFor(() => expect(entry).not.toBeDisabled());
    fireEvent.press(entry);
    const confirm = await view.findByRole('button', { name: confirmLabel });
    f.setOutcome('network');
    fireEvent.press(confirm);
    await view.findByText(/The result is unconfirmed/);
    const original = f.fetcher.mock.calls.find(([url]) => url.endsWith('/submit'))![1].body;
    f.setOutcome('Unseen');
    view.rerender(<CancellationNotice />);
    fireEvent.press(await view.findByRole('button', { name: 'Check original cancellation' }));
    const retry = await view.findByRole('button', { name: 'Retry original cancellation request' });
    fireEvent.press(retry);
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
    f.setOutcome('Cancelled');
    fireEvent.press(view.getByRole('button', { name: 'Retry the same cancellation request' }));
    await view.findByText(
      'The restaurant confirmed cancellation of this order. No refund was issued by this action.',
    );
    const submissions = f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'));
    expect(submissions).toHaveLength(2);
    expect(submissions[1]![1].body).toBe(original);
    expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, () => {})).toBe(
      false,
    );
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
