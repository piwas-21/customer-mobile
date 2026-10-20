import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import RootLayout from '../../app/_layout';
import RestaurantLayout from '../../app/(restaurant)/_layout';
import OrdersRoute from '../../app/(restaurant)/orders';
import AccountRoute from '../../app/(restaurant)/account';
jest.mock('../features/restaurant/RestaurantProvider', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => children,
  useRestaurant: () => ({ context: undefined }),
}));
jest.mock('../features/account/SessionProvider', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => children,
  useSession: () => ({ unavailable: true }),
}));
jest.mock('../features/restaurant/useBootstrap', () => ({
  __esModule: true,
  default: () => ({ data: undefined }),
}));
jest.mock('../features/basket/BasketProvider', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../features/orders/OrdersScreen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: () => React.createElement(Text, null, 'Orders destination') };
});
jest.mock('../features/account/AccountScreen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(Text, null, 'Account destination'),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  ),
  SafeAreaProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  function Navigator({ children }: PropsWithChildren) {
    return React.createElement(View, null, children);
  }
  Navigator.Screen = function RouteName({ name }: { name: string }) {
    return React.createElement(Text, null, name);
  };
  return { Stack: Navigator, Tabs: Navigator, useRouter: jest.fn() };
});
it('composes the root and customer navigation destinations', () => {
  const root = render(<RootLayout />);
  expect(root.getByText('index')).toBeTruthy();
  expect(root.getByText('(restaurant)')).toBeTruthy();
  root.unmount();
  const tabs = render(<RestaurantLayout />);
  for (const name of ['menu', 'orders', 'account']) expect(tabs.getByText(name)).toBeTruthy();
});
it('connects the private orders and account destinations', () => {
  const orders = render(<OrdersRoute />);
  expect(orders.getByText('Orders destination')).toBeTruthy();
  orders.unmount();
  const account = render(<AccountRoute />);
  expect(account.getByText('Account destination')).toBeTruthy();
});
