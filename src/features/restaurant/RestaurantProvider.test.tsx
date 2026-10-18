import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import RestaurantProvider, { useRestaurant } from './RestaurantProvider';
import { fetchDirectory } from '../../core/transport';
import { directoryInput, tenantA } from '../../test/fixtures';
jest.mock('../../config', () => ({
  runtimeConfig: {
    environment: 'staging',
    directoryOrigin: 'https://directory.example',
    linkOrigin: 'https://links.example',
  },
}));
jest.mock('../../storage/publicPreferences', () => ({
  readPreferences: async () => ({ savedIds: [] }),
  savePreferences: jest.fn(),
}));
jest.mock('../../core/transport', () => ({
  ...jest.requireActual<typeof import('../../core/transport')>('../../core/transport'),
  fetchDirectory: jest.fn(),
}));
function Probe() {
  const state = useRestaurant();
  const [outcome, setOutcome] = useState('untouched');
  return (
    <View>
      <Text>{state.directory ? 'directory available' : 'directory unavailable'}</Text>
      <Text>{state.context?.tenant.name ?? 'no restaurant'}</Text>
      <Text>{outcome}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="select alpha"
        onPress={() => setOutcome(String(state.select(tenantA)))}
      >
        <Text>Select</Text>
      </Pressable>
    </View>
  );
}
it('withdraws an expired directory during outage and handles subsequent selection without crashing', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  jest
    .mocked(fetchDirectory)
    .mockResolvedValueOnce(directoryInput())
    .mockRejectedValue(new Error('outage'));
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const screen = render(
    <QueryClientProvider client={client}>
      <RestaurantProvider>
        <Probe />
      </RestaurantProvider>
    </QueryClientProvider>,
  );
  try {
    await waitFor(() => expect(screen.getByText('directory available')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'select alpha' }));
    expect(screen.getByText('Alpha')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByText('directory unavailable')).toBeTruthy();
    expect(screen.getByText('no restaurant')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'select alpha' }));
    expect(screen.getByText('false')).toBeTruthy();
  } finally {
    screen.unmount();
    client.clear();
    jest.useRealTimers();
  }
});
