import '../../i18n';
import { useEffect } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import BasketProvider, { useBasket } from './BasketProvider';
import BasketScreen from './BasketScreen';
import { cancellationUiFixture } from '../../test/cancellationUi';
import { decisionProof } from '../../core/orderDecisions';
import type { SessionRepository } from '../../core/sessionRepository';
let mockRepository: SessionRepository;
let basket: ReturnType<typeof useBasket>;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/useBootstrap');
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
function Probe() {
  const current = useBasket();
  useEffect(() => {
    basket = current;
  }, [current]);
  return <BasketScreen />;
}
it('explains and recovers a restored cancellation from the blocked basket without submitting another mutation', async () => {
  const f = await cancellationUiFixture();
  mockRepository = f.repository;
  await f.repository.cancellations.prepare(
    f.context,
    f.principal,
    { kind: 'original', proof: decisionProof(f.decision) },
    f.preparation,
    () => '44444444-4444-4444-8444-444444444444',
    () => {},
  );
  f.setOutcome('Unseen');
  const view = render(
    <BasketProvider>
      <Probe />
    </BasketProvider>,
    { wrapper: f.Wrapper },
  );
  try {
    await view.findByText(/The restaurant has not recorded this cancellation yet/);
    await waitFor(() => expect(basket.loading).toBe(false));
    expect(basket.canAdd).toBe(false);
    expect(view.getByRole('button', { name: 'Check original cancellation' })).toBeTruthy();
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
    f.setOutcome('Cancelled');
    fireEvent.press(view.getByRole('button', { name: 'Check original cancellation' }));
    await view.findByText(
      'The restaurant confirmed cancellation of this order. No refund was issued by this action.',
    );
    await waitFor(() => expect(basket.canAdd).toBe(true));
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/submit'))).toBe(false);
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
