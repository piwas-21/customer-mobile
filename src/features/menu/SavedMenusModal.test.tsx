import '../../i18n';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AppState, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Directory } from '../../core/directory';
import { fixtureDirectory } from '../../test/fixtures';
import { publicMenuFixture } from '../../test/publicMenus';
import SavedMenusModal from './SavedMenusModal';
import SavedMenusControl from './SavedMenusControl';
jest.mock('../../config', () => ({ runtimeConfig: { environment: 'staging' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());
function setup(directory?: Directory, control = false, snapshot = publicMenuFixture()) {
  let raw = JSON.stringify({ schemaVersion: 1, snapshots: [snapshot] });
  jest.mocked(AsyncStorage.getItem).mockImplementation(() => Promise.resolve(raw));
  jest.mocked(AsyncStorage.setItem).mockImplementation((_key, value) => {
    raw = value;
    return Promise.resolve();
  });
  const cache = new QueryClient();
  const close = jest.fn();
  const screen = render(
    <QueryClientProvider client={cache}>
      {control ? (
        <SavedMenusControl directory={directory} />
      ) : (
        <SavedMenusModal directory={directory} environment="staging" onClose={close} />
      )}
    </QueryClientProvider>,
  );
  return {
    screen,
    cache,
    close,
    dispose: () => {
      screen.unmount();
      cache.clear();
    },
  };
}
it('opens an offline text-only dated preview without network, image requests, prices, availability or purchase actions', async () => {
  const f = setup();
  try {
    const open = await f.screen.findByRole('button', { name: 'Alpha · en · View saved menu' });
    fireEvent.press(open);
    expect(f.screen.getByText('Cached soup')).toBeTruthy();
    expect(f.screen.getByText('Saved description')).toBeTruthy();
    expect(f.screen.getByText('Connect to check current prices and options.')).toBeTruthy();
    expect(
      f.screen.getByText('Recorded allergens: Milk. Confirm with the restaurant.'),
    ).toBeTruthy();
    expect(f.screen.getByText(/Saved .* on this device · en/)).toBeTruthy();
    expect(f.screen.queryByText(/CHF|EUR|9\.00/)).toBeNull();
    expect(f.screen.queryByRole('button', { name: /Add|basket|Order|View dish/i })).toBeNull();
    const scroll = within(f.screen.UNSAFE_getByType(FlatList));
    expect(scroll.getByRole('button', { name: 'Back to saved menus' })).toBeTruthy();
    expect(scroll.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Back to saved menus' }));
    expect(f.screen.queryByText('Cached soup')).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(expoFetch).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});
it.each(['disabled', 'missing', 'incompatible'] as const)(
  'respects known current directory withdrawal: %s',
  async (mode) => {
    const directory = fixtureDirectory();
    const tenants =
      mode === 'missing'
        ? []
        : directory.tenants.map((tenant) => ({
            ...tenant,
            status: mode === 'disabled' ? ('disabled' as const) : tenant.status,
            contractVersions: mode === 'incompatible' ? [2] : tenant.contractVersions,
          }));
    const f = setup({ ...directory, tenants });
    try {
      await f.screen.findByText('Menus you browse online can be saved here for later reading.');
      expect(f.screen.queryByRole('button', { name: 'Alpha · en · View saved menu' })).toBeNull();
      expect(expoFetch).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  },
);
it('removes a selected local preview explicitly and shows read/storage failures without a silent retry', async () => {
  const f = setup();
  try {
    const remove = await f.screen.findByRole('button', {
      name: 'Remove saved menu for Alpha · en',
    });
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
    fireEvent.press(remove);
    await f.screen.findByText('This saved menu could not be removed. Try again.');
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    fireEvent.press(f.screen.getByRole('button', { name: 'Remove saved menu for Alpha · en' }));
    await f.screen.findByText('Menus you browse online can be saved here for later reading.');
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read unavailable'));
    fireEvent.press(f.screen.getByRole('button', { name: 'Check saved menus' }));
    await f.screen.findByText('Saved menus could not be read. Try again.');
    fireEvent.press(f.screen.getByRole('button', { name: 'Check saved menus' }));
    await f.screen.findByText('Menus you browse online can be saved here for later reading.');
  } finally {
    f.dispose();
  }
});
it('withdraws an expired preview when returning to the foreground and supports bounded text search', async () => {
  const now = Date.now();
  const f = setup();
  try {
    fireEvent.press(await f.screen.findByRole('button', { name: 'Alpha · en · View saved menu' }));
    fireEvent.changeText(f.screen.getByLabelText('Search the menu'), 'missing dish');
    expect(f.screen.queryByText('Cached soup')).toBeNull();
    fireEvent.changeText(f.screen.getByLabelText('Search the menu'), 'SOUP');
    expect(f.screen.getByText('Cached soup')).toBeTruthy();
    jest.spyOn(Date, 'now').mockReturnValue(now + 604_800_000);
    const listener = jest.mocked(AppState.addEventListener).mock.calls[0]![1];
    await act(async () => listener('active'));
    await f.screen.findByText('Menus you browse online can be saved here for later reading.');
    expect(f.screen.queryByText('Cached soup')).toBeNull();
  } finally {
    f.dispose();
  }
});
it('does not read device storage until the configured saved-preview control is opened', async () => {
  const f = setup(undefined, true);
  try {
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    fireEvent.press(f.screen.getByRole('button', { name: 'Saved menu previews' }));
    await f.screen.findByRole('button', { name: 'Alpha · en · View saved menu' });
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.screen.queryByRole('button', { name: 'Alpha · en · View saved menu' })).toBeNull();
    expect(expoFetch).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it('allows a currently supported restaurant preview and explains incomplete saved content', async () => {
  const snapshot = {
    ...publicMenuFixture(),
    incomplete: true,
    items: [{ ...publicMenuFixture().items[0]!, description: null, allergens: [] }],
  };
  const f = setup(fixtureDirectory(), false, snapshot);
  try {
    fireEvent.press(await f.screen.findByRole('button', { name: 'Alpha · en · View saved menu' }));
    expect(f.screen.getByText('Saved items only. Connect for the full menu.')).toBeTruthy();
    expect(f.screen.getByText('Cached soup')).toBeTruthy();
    expect(f.screen.queryByText('Saved description')).toBeNull();
    expect(f.screen.queryByText(/Recorded allergens:/)).toBeNull();
  } finally {
    f.dispose();
  }
});
