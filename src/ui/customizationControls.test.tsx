import '../i18n';
import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import QuantityStepper from './QuantityStepper';
import ChoiceGroup from './ChoiceGroup';
import type { CatalogueChoiceGroup } from '../domain/catalogueChoices';
import type { Selection } from '../domain/customization';
import { toggleChoice } from '../domain/choiceInteraction';
const group: CatalogueChoiceGroup = {
  id: 'choice',
  kind: 'explicit',
  label: 'Choose a filling',
  min: 1,
  max: 1,
  cardinality: 'choices',
  repeat: true,
  defaults: { chicken: 1 },
  options: [
    {
      id: 'chicken',
      targetId: 'chicken',
      kind: 'product',
      displayOrder: 0,
      label: 'Chicken',
      maxQuantity: 3,
      available: true,
    },
    {
      id: 'falafel',
      targetId: 'falafel',
      kind: 'product',
      displayOrder: 1,
      label: 'Falafel',
      maxQuantity: 3,
      available: true,
    },
    {
      id: 'beef',
      targetId: 'beef',
      kind: 'product',
      displayOrder: 2,
      label: 'Beef',
      maxQuantity: 3,
      available: false,
    },
  ],
};
it('exposes a bounded adjustable quantity with labelled touch actions', () => {
  const change = jest.fn();
  const screen = render(
    <QuantityStepper label="Dish quantity" value={1} minimum={1} maximum={3} onChange={change} />,
  );
  const quantity = screen.getByRole('adjustable', { name: 'Dish quantity' });
  expect(quantity).toHaveAccessibilityValue({ min: 1, max: 3, now: 1 });
  expect(screen.getByRole('button', { name: 'Decrease Dish quantity' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Increase Dish quantity' }));
  expect(change).toHaveBeenLastCalledWith(2);
  fireEvent(quantity, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(change).toHaveBeenCalledTimes(1);
  screen.rerender(
    <QuantityStepper label="Dish quantity" value={3} minimum={1} maximum={3} onChange={change} />,
  );
  expect(screen.getByRole('button', { name: 'Increase Dish quantity' })).toBeDisabled();
  fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
    nativeEvent: { actionName: 'decrement' },
  });
  expect(change).toHaveBeenLastCalledWith(2);
});
it.each([Number.NaN, -1, 4])(
  'blocks an invalid quantity %s and never sends invalid accessibility values',
  (value) => {
    const change = jest.fn();
    const screen = render(
      <QuantityStepper label="Quantity" value={value} minimum={0} maximum={3} onChange={change} />,
    );
    expect(screen.getByRole('adjustable')).toBeDisabled();
    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({
      text: 'Currently unavailable',
    });
    fireEvent.press(screen.getByRole('button', { name: 'Increase Quantity' }));
    expect(change).not.toHaveBeenCalled();
  },
);
it('blocks both touch and screen-reader changes while disabled and respects the group-level cap', () => {
  const change = jest.fn();
  const screen = render(
    <QuantityStepper label="Sauce" value={2} minimum={0} maximum={3} disabled onChange={change} />,
  );
  fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
    nativeEvent: { actionName: 'increment' },
  });
  expect(change).not.toHaveBeenCalled();
  screen.rerender(
    <QuantityStepper
      label="Sauce"
      value={2}
      minimum={0}
      maximum={3}
      canIncrease={false}
      onChange={change}
    />,
  );
  expect(screen.getByRole('button', { name: 'Increase Sauce' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Decrease Sauce' }));
  expect(change).toHaveBeenCalledWith(1);
});
it('replaces a required single choice directly, retains quantity controls and blocks unavailable options', () => {
  function Harness() {
    const [selection, setSelection] = useState<Selection>({ chicken: 1 });
    return <ChoiceGroup group={group} selection={selection} onChange={setSelection} />;
  }
  const screen = render(<Harness />);
  expect(screen.getByRole('header')).toHaveTextContent('Choose a filling');
  expect(screen.getByRole('radio', { name: 'Chicken', checked: true })).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: 'Falafel' }));
  expect(screen.getByRole('radio', { name: 'Falafel', checked: true })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Chicken', checked: false })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Increase Falafel quantity' }));
  expect(screen.getByRole('adjustable', { name: 'Falafel quantity' })).toHaveAccessibilityValue({
    now: 2,
  });
  expect(screen.getByText('1 selected')).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: 'Falafel' }));
  expect(screen.getByRole('radio', { name: 'Falafel', checked: true })).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: 'Beef', disabled: true }));
  expect(screen.getByRole('radio', { name: 'Falafel', checked: true })).toBeTruthy();
});
it('lets optional choices be removed and required units stop at the shared group cap', () => {
  const change = jest.fn();
  const optional = { ...group, min: 0, max: 2, cardinality: 'units' as const };
  const screen = render(
    <ChoiceGroup group={optional} selection={{ chicken: 2 }} onChange={change} />,
  );
  expect(screen.getByRole('checkbox', { name: 'Chicken', checked: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Increase Chicken quantity' })).toBeDisabled();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Chicken' }));
  expect(change).toHaveBeenLastCalledWith({ chicken: 0 });
  screen.rerender(<ChoiceGroup group={{ ...optional, min: 2 }} selection={{}} onChange={change} />);
  expect(screen.getByText('Choose 2 more')).toBeTruthy();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Chicken' }));
  expect(change).toHaveBeenLastCalledWith({ chicken: 1 });
});
it('preserves a fixed answer when a replacement is rejected instead of returning a cleared draft', () => {
  const fixed = {
    ...group,
    options: group.options.map((option) => ({
      ...option,
      minimumQuantity: option.id === 'chicken' ? 1 : 0,
    })),
  };
  const original = { chicken: 1 };
  expect(toggleChoice(fixed, original, 'falafel')).toBe(original);
  expect(toggleChoice(fixed, original, 'chicken')).toBe(original);
  expect(toggleChoice(fixed, original, 'unknown')).toBe(original);
  expect(toggleChoice(fixed, original, 'beef')).toBe(original);
});
it('keeps no-answer options and exclusion groups mutually exclusive without changing fixed choices', () => {
  const sauces = {
    ...group,
    min: 0,
    max: 3,
    options: group.options.map((option) => ({
      ...option,
      available: true,
      isNoneOption: option.id === 'beef',
      exclusionKey: 'sauce',
    })),
  };
  expect(toggleChoice(sauces, { chicken: 1 }, 'falafel')).toEqual({ chicken: 0, falafel: 1 });
  expect(toggleChoice(sauces, { chicken: 1 }, 'beef')).toEqual({ chicken: 0, beef: 1 });
  expect(toggleChoice(sauces, { beef: 1 }, 'beef')).toEqual({ beef: 0 });
});

it('labels fixed ingredients as included without disabling their allowed quantity controls', () => {
  const change = jest.fn();
  const fixed: CatalogueChoiceGroup = {
    ...group,
    kind: 'recipe',
    min: 1,
    max: 3,
    cardinality: 'units',
    options: [{ ...group.options[0]!, label: 'Bread', minimumQuantity: 1 }],
  };
  const screen = render(<ChoiceGroup group={fixed} selection={{ chicken: 1 }} onChange={change} />);
  expect(screen.getByRole('checkbox', { name: 'Bread' })).toBeDisabled();
  expect(screen.getByText('Included')).toBeTruthy();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Bread' }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Increase Bread quantity' }));
  expect(change).toHaveBeenCalledWith({ chicken: 2 });
});
