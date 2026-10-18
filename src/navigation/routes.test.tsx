import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import RootLayout from '../../app/_layout';
import RestaurantLayout from '../../app/(restaurant)/_layout';
import OrdersRoute from '../../app/(restaurant)/orders';
import AccountRoute from '../../app/(restaurant)/account';
import { routerFixture } from '../test/router';
import { useRouter } from 'expo-router';
jest.mock('../features/restaurant/RestaurantProvider', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => children,
}));
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
it('offers the menu from empty orders and explains tenant-local account availability', () => {
  const router = routerFixture();
  jest.mocked(useRouter).mockReturnValue(router);
  const orders = render(<OrdersRoute />);
  fireEvent.press(orders.getByRole('button', { name: 'Explore the menu' }));
  expect(router.replace).toHaveBeenCalledWith('/menu');
  orders.unmount();
  const account = render(<AccountRoute />);
  expect(account.getByText('Your account belongs to the selected restaurant.')).toBeTruthy();
});
