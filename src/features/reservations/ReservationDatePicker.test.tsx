import '../../i18n';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ReservationDatePicker from './ReservationDatePicker';
jest.mock('@react-native-community/datetimepicker', () => jest.fn(() => null));
jest.mock(
  'react-native-safe-area-context',
  () =>
    jest.requireActual<typeof import('react-native-safe-area-context/jest/mock')>(
      'react-native-safe-area-context/jest/mock',
    ).default,
);
afterEach(() => jest.restoreAllMocks());
it('keeps the iOS selection as a draft until explicit confirmation', () => {
  const choose = jest.fn();
  const close = jest.fn();
  const screen = render(
    <ReservationDatePicker
      day="2026-11-01"
      minimum="2026-11-01"
      onChoose={choose}
      onClose={close}
    />,
  );
  const picker = jest.mocked(DateTimePicker).mock.calls.at(-1)?.[0];
  const value = new Date('2026-11-02T00:00:00Z');
  act(() =>
    picker?.onValueChange?.({ nativeEvent: { timestamp: value.getTime(), utcOffset: 0 } }, value),
  );
  expect(choose).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Use this date' }));
  expect(choose).toHaveBeenCalledWith('2026-11-02');
});
it('dismisses an iOS draft without publishing and prevents confirming a date withdrawn by the minimum', () => {
  const choose = jest.fn();
  const close = jest.fn();
  const screen = render(
    <ReservationDatePicker
      day="2026-11-01"
      minimum="2026-11-01"
      onChoose={choose}
      onClose={close}
    />,
  );
  screen.rerender(
    <ReservationDatePicker
      day="2026-11-01"
      minimum="2026-11-02"
      onChoose={choose}
      onClose={close}
    />,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Use this date' }));
  expect(choose).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(choose).not.toHaveBeenCalled();
});
it('uses the Android native confirmation/dismissal and rejects a value before the minimum day', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const choose = jest.fn();
  const close = jest.fn();
  const screen = render(
    <ReservationDatePicker
      day="2026-11-01"
      minimum="2026-11-01"
      onChoose={choose}
      onClose={close}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Use this date' })).toBeNull();
  const picker = jest.mocked(DateTimePicker).mock.calls.at(-1)?.[0];
  const before = new Date('2026-10-31T12:00:00Z');
  act(() =>
    picker?.onValueChange?.({ nativeEvent: { timestamp: before.getTime(), utcOffset: 0 } }, before),
  );
  expect(choose).not.toHaveBeenCalled();
  const value = new Date('2026-11-02T12:00:00Z');
  act(() =>
    picker?.onValueChange?.({ nativeEvent: { timestamp: value.getTime(), utcOffset: 0 } }, value),
  );
  expect(choose).toHaveBeenCalledWith('2026-11-02');
  act(() => picker?.onDismiss?.());
  expect(close).toHaveBeenCalledTimes(1);
});
