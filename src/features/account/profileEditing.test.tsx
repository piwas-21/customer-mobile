import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import AccountRoute from '../../../app/(restaurant)/account';
import { readProfile } from '../../api/profile';
import {
  prepareAccountFixture,
  accountStore,
  accountRepository,
  customerProfile,
} from '../../test/accounts';
import { session } from '../../test/sessions';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
jest.mock('../../storage/sessions', () => ({
  deviceSessions:
    jest.requireActual<typeof import('../../test/accounts')>('../../test/accounts')
      .accountRepository,
}));
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
jest.mock('../restaurant/useBootstrap', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../api/profile', () => ({
  ...jest.requireActual<typeof import('../../api/profile')>('../../api/profile'),
  readProfile: jest.fn(),
}));
beforeEach(() => {
  accountStore.values.clear();
  jest.restoreAllMocks();
  jest.mocked(readProfile).mockReset().mockResolvedValue(customerProfile);
});
async function setup() {
  const fixture = prepareAccountFixture();
  await accountRepository.activate(fixture.context, session, () => true);
  const screen = render(<AccountRoute />, { wrapper: fixture.Wrapper });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit profile' })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));
  return {
    ...fixture,
    screen,
    close: () => {
      screen.unmount();
      fixture.queryClient.clear();
    },
  };
}

it('edits names and removes a phone using labelled native fields and one verified save', async () => {
  jest.mocked(readProfile).mockResolvedValue({ ...customerProfile, phoneNumber: '+41791234567' });
  const fixture = await setup();
  try {
    await waitFor(() => expect(fixture.screen.getByLabelText('First name')).toBeTruthy());
    expect(fixture.screen.getByLabelText('Phone number').props.value).toBe('+41791234567');
    fireEvent.changeText(fixture.screen.getByLabelText('First name'), 'Alexis');
    fireEvent.changeText(fixture.screen.getByLabelText('Phone number'), '');
    fixture.fetcher.mockResolvedValue(
      response({ success: true, data: { ...customerProfile, firstName: 'Alexis' } }),
    );
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fixture.screen.getByText('Your profile has been saved.')).toBeTruthy(),
    );
    expect(fixture.screen.getByText('Alexis Guest')).toBeTruthy();
    expect(fixture.screen.queryByLabelText('First name')).toBeNull();
    expect(fixture.screen.queryByText('+41791234567')).toBeNull();
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fixture.fetcher.mock.calls[0]?.[1].body ?? '{}')).toEqual({
      firstName: 'Alexis',
      lastName: 'Guest',
      phoneNumber: '',
    });
  } finally {
    fixture.close();
  }
});

it('validates fields inline and discards cancelled drafts without a write', async () => {
  const fixture = await setup();
  try {
    fireEvent.changeText(fixture.screen.getByLabelText('First name'), '');
    fireEvent.changeText(fixture.screen.getByLabelText('Phone number'), 'bad');
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Save changes' }));
    expect(fixture.screen.getByLabelText('First name').props.accessibilityHint).toBe(
      'Enter a name with 1 to 100 characters.',
    );
    expect(fixture.screen.getByLabelText('Phone number').props.accessibilityHint).toBe(
      'Enter a valid phone number or leave it blank.',
    );
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.screen.queryByLabelText('First name')).toBeNull();
    expect(fixture.fetcher).not.toHaveBeenCalled();
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Edit profile' }));
    expect(fixture.screen.getByLabelText('First name').props.value).toBe('Alex');
    fireEvent(fixture.screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(fixture.screen.queryByLabelText('First name')).toBeNull();
  } finally {
    fixture.close();
  }
});

it('keeps the draft on refusal, blocks dismissal while busy, and retries only after another explicit save', async () => {
  const fixture = await setup();
  const finish = deferred<Response>();
  try {
    fixture.fetcher
      .mockReturnValueOnce(finish.promise)
      .mockResolvedValue(response({ success: true, data: customerProfile }));
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Save changes' }));
    expect(
      fixture.screen.getByRole('button', { name: 'Cancel' }).props.accessibilityState.disabled,
    ).toBe(true);
    fireEvent(fixture.screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(fixture.screen.getByLabelText('First name')).toBeTruthy();
    finish.resolve(response({}, 503));
    await waitFor(() =>
      expect(fixture.screen.getByText(/We could not confirm your changes/)).toBeTruthy(),
    );
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
    fireEvent.press(fixture.screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fixture.screen.getByText('Your profile has been saved.')).toBeTruthy(),
    );
    expect(fixture.fetcher).toHaveBeenCalledTimes(2);
  } finally {
    finish.resolve(response({}, 503));
    fixture.close();
  }
});
