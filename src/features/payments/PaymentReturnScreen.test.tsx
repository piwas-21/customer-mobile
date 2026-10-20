import '../../i18n';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import PaymentReturnScreen from './PaymentReturnScreen';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { fixtureDirectory, tenantA, tenantB } from '../../test/fixtures';
import { TenantBoundary } from '../../core/tenantContext';
jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../config', () => ({ runtimeConfig: { linkOrigin: 'https://links.example' } }));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
const url = `https://links.example/r/alpha/payment-return/${tenantA}?operation=${tenantB}`;
function setup(value = url, selected = true) {
  const directory = fixtureDirectory();
  const context = selected ? new TenantBoundary(directory).select(tenantA) : undefined;
  const replace = jest.fn();
  const select = jest.fn().mockReturnValue(true);
  jest.mocked(useLinkingURL).mockReturnValue(value);
  jest.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
  jest.mocked(useRestaurant).mockReturnValue({
    context,
    directory,
    client: undefined,
    loading: false,
    select,
    clear: jest.fn(),
    refresh: jest.fn(),
  });
  return { replace, select };
}
it('uses an approved return only to navigate to original-proof order recovery', async () => {
  const f = setup();
  const view = render(<PaymentReturnScreen />);
  try {
    await waitFor(() => expect(f.replace).toHaveBeenCalledWith('/orders'));
    expect(f.select).not.toHaveBeenCalled();
    expect(view.queryByText(/Payment received/)).toBeNull();
  } finally {
    view.unmount();
  }
});
it('restores only the directory-approved restaurant after a fresh process launch', async () => {
  const f = setup(url, false);
  const view = render(<PaymentReturnScreen />);
  try {
    await waitFor(() => expect(f.replace).toHaveBeenCalledWith('/orders'));
    expect(f.select).toHaveBeenCalledWith(tenantA);
  } finally {
    view.unmount();
  }
});
it.each([
  url.replace('links.example', 'evil.example'),
  url.replace('/alpha/', '/unknown/'),
  url + '&paid=true',
  url + `&operation=${tenantB}`,
  url.replace('https:', 'sofra:'),
  url.replace('/payment-return/', '/order/'),
])('refuses unsafe return %s without selecting or publishing', async (value) => {
  const f = setup(value, false);
  const view = render(<PaymentReturnScreen />);
  try {
    await waitFor(() => expect(view.queryByText('Loading…')).toBeNull());
    expect(f.select).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});
it('waits for a fresh trusted directory and refuses a failed selection', async () => {
  const f = setup(url, false);
  jest.mocked(useRestaurant).mockReturnValueOnce({
    ...jest.mocked(useRestaurant)(),
    directory: undefined,
  });
  const view = render(<PaymentReturnScreen />);
  try {
    expect(f.replace).not.toHaveBeenCalled();
    f.select.mockReturnValue(false);
    view.rerender(<PaymentReturnScreen />);
    await waitFor(() => expect(f.select).toHaveBeenCalledWith(tenantA));
    expect(f.replace).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});

it('preserves newer restaurant selection until the customer explicitly returns', async () => {
  const f = setup();
  jest.mocked(useRestaurant).mockReturnValue({
    ...jest.mocked(useRestaurant)(),
    context: new TenantBoundary(fixtureDirectory()).select(tenantB),
  });
  const view = render(<PaymentReturnScreen />);
  try {
    expect(await view.findByText(/Your current restaurant is still selected/)).toBeTruthy();
    expect(f.select).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Open the payment’s restaurant' }));
    expect(f.select).toHaveBeenCalledWith(tenantA);
    expect(f.replace).toHaveBeenCalledWith('/orders');
  } finally {
    view.unmount();
  }
});
