jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual<typeof import('@react-native-async-storage/async-storage').default>(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
