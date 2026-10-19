import '../../i18n';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SessionRepository } from '../../core/sessionRepository';
import { SessionController } from '../../core/sessionController';
import { basketWorkspaceFixture } from '../../test/basketWorkspace';
import { existingBasketSession } from '../../test/basketMutations';
import { useSession } from '../account/SessionProvider';
import BasketScreen from './BasketScreen';
let mockRepository: SessionRepository;
jest.mock('../../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({}), Stack: { Screen: () => null } }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
it('discards private drafts on controller replacement even with identical user, owner version and tenant', async () => {
  const f = await basketWorkspaceFixture();
  mockRepository = f.repository;
  await existingBasketSession(f);
  const screen = render(<BasketScreen />, { wrapper: f.Wrapper });
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Meal', disabled: false })).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Edit Meal' }));
    fireEvent.changeText(
      screen.getByLabelText('Instructions for the kitchen (optional)'),
      'Private old controller',
    );
    const replacement = new SessionController(f.context, f.client, f.repository);
    await replacement.initialize();
    jest.mocked(useSession).mockReturnValue({ ...f.state, controller: replacement });
    screen.rerender(<BasketScreen />);
    expect(screen.queryByDisplayValue('Private old controller')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Meal', disabled: false })).toBeTruthy(),
    );
    expect(screen.queryByLabelText('Instructions for the kitchen (optional)')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Edit Meal' }));
    expect(screen.getByLabelText('Instructions for the kitchen (optional)')).toHaveDisplayValue('');
    expect(f.fetcher.mock.calls.some(([, request]) => request.method === 'POST')).toBe(false);
  } finally {
    screen.unmount();
    f.cache.clear();
  }
});
