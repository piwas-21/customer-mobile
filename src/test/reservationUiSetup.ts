import { randomUUID } from 'expo-crypto';
import type { SessionRepository } from '../core/sessionRepository';
let mockRepository: SessionRepository;
export const setReservationUiRepository = (value: SessionRepository) => {
  mockRepository = value;
};
jest.mock('../storage/sessions', () => ({
  get deviceSessions() {
    return mockRepository;
  },
}));
jest.mock('../features/restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../features/account/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../features/restaurant/useBootstrap');
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => jest.fn(() => null));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(randomUUID).mockReset();
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2030-05-17T14:00:00Z'));
});
afterEach(() => jest.restoreAllMocks());
