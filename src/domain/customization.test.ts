import {
  changeChoice,
  quantityIsValid,
  validateSelection,
  type ChoiceGroup,
} from './customization';
const group: ChoiceGroup = {
  id: 'meat',
  label: 'Meat',
  min: 3,
  max: 3,
  repeat: true,
  options: [
    { id: 'chicken', label: 'Chicken', maxQuantity: 3, available: true },
    { id: 'beef', label: 'Beef', maxQuantity: 3, available: true },
    { id: 'sold-out', label: 'Unavailable', maxQuantity: 3, available: false },
  ],
};
it('counts repeated portions and enforces independent min/max fixture', () => {
  expect(validateSelection(group, { chicken: 2 })).toBe('minimum');
  expect(validateSelection(group, { chicken: 2, beef: 1 })).toBe('valid');
  expect(validateSelection(group, { chicken: 3, beef: 1 })).toBe('maximum');
  expect(validateSelection(group, { chicken: -1 })).toBe('invalid');
  expect(validateSelection(group, { chicken: 1.5 })).toBe('invalid');
  expect(validateSelection(group, { chicken: 4 })).toBe('invalid');
  expect(validateSelection(group, { unknown: 1 })).toBe('invalid');
  expect(validateSelection(group, { 'sold-out': 1 })).toBe('invalid');
  expect(validateSelection({ ...group, repeat: false }, { chicken: 2 })).toBe('invalid');
});
it('permits incomplete intermediate steps but blocks over-selection', () => {
  expect(changeChoice(group, {}, 'chicken', 1)).toEqual({ chicken: 1 });
  const full = { chicken: 3 };
  expect(changeChoice(group, full, 'beef', 1)).toBe(full);
  expect(changeChoice(group, {}, 'unknown', 1)).toEqual({});
  expect(quantityIsValid(1)).toBe(true);
  expect(quantityIsValid(99)).toBe(true);
  for (const value of [0, 100, -1, 1.5, Infinity]) expect(quantityIsValid(value)).toBe(false);
});
