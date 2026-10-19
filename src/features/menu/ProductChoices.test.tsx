import '../../i18n';
import { fireEvent, render } from '@testing-library/react-native';
import ProductChoiceStep from './ProductChoiceStep';
import ProductSideStep from './ProductSideStep';
import VariationPicker from '../../ui/VariationPicker';
import type { CatalogueChoiceGroup } from '../../domain/catalogueChoices';
import type { SideChoice } from '../../domain/sideChoices';
const group: CatalogueChoiceGroup = {
  id: 'recipe',
  kind: 'recipe',
  label: 'Ingredients',
  min: 0,
  max: 2,
  repeat: false,
  defaults: {},
  options: ['Hot', 'Mild'].map((label, displayOrder) => ({
    id: label,
    targetId: label,
    label,
    kind: 'ingredient',
    displayOrder,
    maxQuantity: 1,
    available: true,
    exclusionKey: 'heat',
  })),
};
it('applies full source exclusions when the authored screen shows only one option', () => {
  const change = jest.fn();
  const screen = render(
    <ProductChoiceStep
      choices={[{ sourceId: 'recipe', group: { ...group, options: group.options.slice(0, 1) } }]}
      groups={[group]}
      selection={{ recipe: { Mild: 1 } }}
      disabled={false}
      onChange={change}
    />,
  );
  expect(screen.queryByRole('checkbox', { name: 'Mild' })).toBeNull();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Hot' }));
  expect(change).toHaveBeenCalledWith('recipe', { Hot: 1, Mild: 0 });
});
const variations = {
  defaultId: 'small',
  options: [
    { id: null, label: 'Original' },
    { id: 'small', label: 'Small' },
    { id: 'large', label: 'Large' },
  ],
};
const side: SideChoice = {
  membershipId: 'drink-link',
  productId: 'drink',
  label: 'Drink',
  required: false,
  available: true,
  variations,
};
it('keeps side membership, quantity and variation distinct and permits optional removal', () => {
  const change = jest.fn();
  const screen = render(
    <ProductSideStep choices={[side]} selection={{}} disabled={false} onChange={change} />,
  );
  fireEvent.press(screen.getByRole('checkbox', { name: 'Drink' }));
  expect(change).toHaveBeenLastCalledWith('drink-link', { quantity: 1, variationId: 'small' });
  screen.rerender(
    <ProductSideStep
      choices={[side]}
      selection={{ 'drink-link': { quantity: 1, variationId: 'small' } }}
      disabled={false}
      onChange={change}
    />,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Increase Drink quantity' }));
  expect(change).toHaveBeenLastCalledWith('drink-link', { quantity: 2, variationId: 'small' });
  fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
  expect(change).toHaveBeenLastCalledWith('drink-link', { quantity: 1, variationId: 'large' });
  fireEvent.press(screen.getByRole('checkbox', { name: 'Drink' }));
  expect(change).toHaveBeenLastCalledWith('drink-link', null);
});
it('does not remove required sides or select unavailable sides', () => {
  const change = jest.fn();
  const screen = render(
    <ProductSideStep
      choices={[{ ...side, required: true }]}
      selection={{ 'drink-link': { quantity: 1, variationId: 'small' } }}
      disabled={false}
      onChange={change}
    />,
  );
  expect(screen.getByRole('checkbox', { name: 'Drink' })).toBeDisabled();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Drink' }));
  screen.rerender(
    <ProductSideStep
      choices={[{ ...side, available: false }]}
      selection={{}}
      disabled={false}
      onChange={change}
    />,
  );
  expect(screen.getByRole('checkbox', { name: 'Drink' })).toBeDisabled();
  expect(change).not.toHaveBeenCalled();
});
it('represents the original variation as null and respects the disabled state', () => {
  const change = jest.fn();
  const screen = render(
    <VariationPicker choices={variations} value="small" label="Size" onChange={change} />,
  );
  fireEvent.press(screen.getByRole('radio', { name: 'Original' }));
  expect(change).toHaveBeenCalledWith(null);
  screen.rerender(
    <VariationPicker choices={variations} value="small" label="Size" disabled onChange={change} />,
  );
  fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
  expect(change).toHaveBeenCalledTimes(1);
});
