import { fireEvent, render } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import Button from './Button';
import Field from './Field';
import { themes } from './theme';
function luminance(color: string): number {
  const components = color
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => parseInt(part, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
}
it.each(Object.entries(themes))('%s semantic text pairs meet AA contrast', (_name, theme) => {
  for (const [foreground, background] of [
    [theme.text, theme.background],
    [theme.text, theme.surface],
    [theme.secondary, theme.background],
    [theme.secondary, theme.surface],
    [theme.onAccent, theme.accent],
    [theme.danger, theme.surface],
  ]) {
    const a = luminance(foreground!);
    const b = luminance(background!);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
it('exposes label/state and prevents duplicate interaction while busy', () => {
  const press = jest.fn();
  const screen = render(<Button label="Add to basket" onPress={press} />);
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  expect(press).toHaveBeenCalledTimes(1);
  screen.rerender(<Button label="Add to basket" onPress={press} busy />);
  expect(
    screen.getByRole('button', { name: 'Add to basket', busy: true, disabled: true }),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  expect(press).toHaveBeenCalledTimes(1);
});
it('keeps a persistent accessible field label and announces validation errors', () => {
  const screen = render(<Field label="Email address" value="bad" error="Enter an email address" />);
  expect(screen.getByLabelText('Email address')).toBeTruthy();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter an email address');
});

it.each(['light', 'dark'] as const)(
  '%s destructive controls bind readable semantic colors and touch targets',
  (scheme) => {
    const color = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
    try {
      const screen = render(<Button label="Remove item" destructive onPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Remove item' })).toHaveStyle({
        backgroundColor: themes[scheme].surface,
        borderColor: themes[scheme].danger,
        minHeight: 48,
      });
      expect(screen.getByText('Remove item')).toHaveStyle({ color: themes[scheme].danger });
    } finally {
      color.mockRestore();
    }
  },
);
