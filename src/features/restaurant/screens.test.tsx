import { routerFixture } from '../../test/router';
import '../../i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import RestaurantScreen from './RestaurantScreen';
import ScanScreen from './ScanScreen';
import { useRestaurant } from './RestaurantProvider';
import { fixtureDirectory, tenantA } from '../../test/fixtures';
import { tableAdmissionInbox } from '../../core/tableAdmissionInbox';
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('expo-camera', () => ({ CameraView: 'CameraView', useCameraPermissions: jest.fn() }));
jest.mock('./RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../../config', () => ({ runtimeConfig: { linkOrigin: 'https://links.example' } }));
const router = routerFixture();
const requestPermission = jest.fn();
function setup(granted = true) {
  const state = {
    directory: fixtureDirectory(),
    context: undefined,
    client: undefined,
    loading: false,
    select: jest.fn(() => true),
    refresh: jest.fn(),
    clear: jest.fn(),
  };
  jest.mocked(useRestaurant).mockReturnValue(state);
  jest.mocked(useRouter).mockReturnValue(router);
  jest.mocked(useCameraPermissions).mockReturnValue([
    {
      granted,
      status: granted ? 'granted' : 'denied',
      canAskAgain: true,
      expires: 'never',
    } as NonNullable<ReturnType<typeof useCameraPermissions>[0]>,
    requestPermission,
    requestPermission,
  ]);
  return state;
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => tableAdmissionInbox.clear());
it('searches trusted restaurants and navigates only after successful selection', () => {
  const state = setup();
  const screen = render(<RestaurantScreen />);
  fireEvent.changeText(screen.getByLabelText('Search restaurants'), ' beta ');
  expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Beta' }));
  expect(router.replace).toHaveBeenCalledWith('/menu');
  state.select.mockReturnValue(false);
  router.replace.mockClear();
  fireEvent.press(screen.getByRole('button', { name: 'Beta' }));
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Scan restaurant QR' }));
  expect(router.push).toHaveBeenCalledWith('/scan');
});
it('offers permission before activating the camera', () => {
  setup(false);
  const screen = render(<ScanScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(screen.UNSAFE_queryByType(CameraView)).toBeNull();
});
it('rejects hostile QR codes, permits retry and admits a valid menu once', () => {
  const state = setup();
  const screen = render(<ScanScreen />);
  fireEvent(screen.UNSAFE_getByType(CameraView), 'barcodeScanned', {
    data: 'https://hostile.example/r/alpha/menu',
  });
  expect(state.select).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  fireEvent(screen.UNSAFE_getByType(CameraView), 'barcodeScanned', {
    data: 'https://links.example/r/alpha/menu',
  });
  expect(state.select).toHaveBeenCalledWith(tenantA);
  expect(router.replace).toHaveBeenCalledTimes(1);
  fireEvent(screen.UNSAFE_getByType(CameraView), 'barcodeScanned', {
    data: 'https://links.example/r/alpha/menu',
  });
  expect(router.replace).toHaveBeenCalledTimes(1);
});
it('does not navigate when a directory change invalidates QR selection', () => {
  const state = setup();
  state.select.mockReturnValue(false);
  const screen = render(<ScanScreen />);
  fireEvent(screen.UNSAFE_getByType(CameraView), 'barcodeScanned', {
    data: 'https://links.example/r/alpha/menu',
  });
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});
it('shows directory outage recovery without stale restaurants', () => {
  const state = setup();
  jest.mocked(useRestaurant).mockReturnValue({ ...state, directory: undefined });
  const screen = render(<RestaurantScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(state.refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
});
it.each([
  'https://links.example/r/alpha/table/private-physical-qr',
  'https://alpha.example/scan?qr=private-physical-qr',
])(
  'hands an accepted physical QR to volatile review without authority in navigation: %s',
  (data) => {
    const state = setup();
    const screen = render(<ScanScreen />);
    fireEvent(screen.UNSAFE_getByType(CameraView), 'barcodeScanned', {
      data,
    });
    expect(state.select).toHaveBeenCalledWith(tenantA);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/table');
    expect(JSON.stringify(router.replace.mock.calls)).not.toContain('private-physical-qr');
    expect(tableAdmissionInbox.take(tenantA)).toBe('private-physical-qr');
    expect(tableAdmissionInbox.take(tenantA)).toBeNull();
  },
);
it.each([
  'https://hostile.example/r/alpha/table/qr',
  'https://links.example/r/alpha/table',
  'https://links.example/r/unknown/table/qr',
  'https://links.example/r/alpha/menu',
])('withdraws a previous table handoff on a new capture %s', (data) => {
  setup();
  tableAdmissionInbox.receive(tenantA, 'older-qr');
  const screen = render(<ScanScreen />);
  fireEvent(screen.UNSAFE_getByType(CameraView), 'barcodeScanned', { data });
  expect(tableAdmissionInbox.take(tenantA)).toBeNull();
  expect(router.replace).not.toHaveBeenCalledWith('/table');
});
