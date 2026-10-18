import { routerFixture } from '../../test/router';
import '../../i18n';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlatList } from 'react-native';
import { z } from 'zod';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MenuScreen from './MenuScreen';
import ProductScreen from './ProductScreen';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { TenantBoundary } from '../../core/tenantContext';
import { CustomerTransport } from '../../core/transport';
import { CredentialVault } from '../../core/credentials';
import { fixtureDirectory, memorySecrets, tenantA, tenantB } from '../../test/fixtures';
jest.mock('expo-router', () => ({ useRouter: jest.fn(), useLocalSearchParams: jest.fn() }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
const router = routerFixture();
const product = {
  id: tenantA,
  name: 'Soup',
  basePrice: 12,
  isActive: true,
  isAvailable: true,
  imageUrl: '/soup.jpg',
  description: 'Fresh vegetables',
  allergens: ['celery'],
};
const clients: QueryClient[] = [];
function setup(mode = 'ready') {
  const directory = fixtureDirectory();
  const boundary = new TenantBoundary(directory);
  const context = boundary.select(tenantA);
  const client = new CustomerTransport(boundary, new CredentialVault(memorySecrets()));
  const request = jest
    .spyOn(client, 'request')
    .mockImplementation(async (_context, path, schema: z.ZodType) => {
      if (mode === 'error') throw new Error('Unavailable');
      if (path.includes('bootstrap'))
        return schema.parse({
          schemaVersion: 1,
          tenantId: tenantA,
          currency: 'EUR',
          locale: 'en',
          timezone: 'Europe/Amsterdam',
          lifecycle: 'active',
          compatibility: 'supported',
          modules: [],
          flags: {},
          capabilities: { menu: mode === 'disabled' ? 'disabled' : 'enabled' },
        });
      if (path.includes('?'))
        return schema.parse({
          items: path.includes('Page=2')
            ? [{ ...product, id: tenantB, name: 'Salad', isAvailable: false, imageUrl: null }]
            : [product, product, { ...product, id: tenantB, isActive: false }],
          totalPages: 2,
          page: path.includes('Page=2') ? 2 : 1,
        });
      return schema.parse(mode === 'unknown-allergens' ? { ...product, allergens: [] } : product);
    });
  const state = {
    directory,
    context,
    client,
    loading: false,
    select: jest.fn(() => true),
    refresh: jest.fn(),
    clear: jest.fn(),
  };
  jest
    .mocked(useRestaurant)
    .mockReturnValue(mode === 'no-context' ? { ...state, context: undefined } : state);
  jest.mocked(useRouter).mockReturnValue(router);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: mode === 'bad-id' ? 'bad' : tenantA });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } },
  });
  clients.push(queryClient);
  const screen = render(
    <QueryClientProvider client={queryClient}>
      {mode.startsWith('product') || ['bad-id', 'unknown-allergens'].includes(mode) ? (
        <ProductScreen />
      ) : (
        <MenuScreen />
      )}
    </QueryClientProvider>,
  );
  return { screen, request, queryClient };
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.clearAllMocks();
});
it('filters duplicate/inactive dishes, searches, paginates and navigates within the restaurant', async () => {
  const { screen, request, queryClient } = setup();
  await waitFor(() =>
    expect(request.mock.calls.some((call) => call[1].includes('/api/Products'))).toBe(true),
  );
  await waitFor(
    () => expect(screen.getAllByRole('button', { name: 'View Soup' })).toHaveLength(1),
    { timeout: 5000 },
  );
  fireEvent.press(screen.getByRole('button', { name: 'View Soup' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: tenantA } });
  fireEvent.changeText(screen.getByLabelText('Search the menu'), 'missing');
  expect(screen.queryByText('Soup')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Search the menu'), '');
  fireEvent(screen.UNSAFE_getByType(FlatList), 'endReached');
  await waitFor(() => expect(screen.getByText('Salad')).toBeTruthy());
  expect(screen.getByText('Currently unavailable')).toBeTruthy();
  const count = request.mock.calls.length;
  fireEvent(screen.UNSAFE_getByType(FlatList), 'endReached');
  expect(request.mock.calls).toHaveLength(count);
  fireEvent(screen.UNSAFE_getByType(FlatList), 'refresh');
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  fireEvent.press(screen.getByRole('button', { name: 'Switch restaurant' }));
  expect(router.push).toHaveBeenCalledWith('/');
});
it('requires restaurant context and offers a safe return', () => {
  const { screen } = setup('no-context');
  fireEvent.press(screen.getByRole('button', { name: 'Switch restaurant' }));
  expect(router.replace).toHaveBeenCalledWith('/');
});
it.each(['disabled', 'error'])('does not show dishes when bootstrap is %s', async (mode) => {
  const { screen, request, queryClient } = setup(mode);
  await waitFor(() =>
    expect(screen.getByText('The menu is unavailable right now. Please try again.')).toBeTruthy(),
  );
  expect(request.mock.calls.every((call) => call[1].includes('bootstrap'))).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
});
it('renders product description and recorded allergens', async () => {
  const { screen } = setup('product');
  await waitFor(() => expect(screen.getByText('Fresh vegetables')).toBeTruthy());
  expect(screen.getByText('Recorded allergens: celery')).toBeTruthy();
});
it('does not infer allergen safety from absent records', async () => {
  const { screen } = setup('unknown-allergens');
  await waitFor(() =>
    expect(
      screen.getByText('Allergen information unavailable. Please ask the restaurant.'),
    ).toBeTruthy(),
  );
});
it('rejects an invalid product identity before making a product request', async () => {
  const { screen, request } = setup('bad-id');
  expect(screen.getByText('The menu is unavailable right now. Please try again.')).toBeTruthy();
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls.every((call) => call[1].includes('bootstrap'))).toBe(true);
});
