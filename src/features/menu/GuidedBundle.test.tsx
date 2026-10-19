import '../../i18n';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import GuidedBundle from './GuidedBundle';
import { useBasket } from '../basket/BasketProvider';
import { basketState } from '../../test/basketState';
import { bundleProduct, dependentBundle } from '../../test/bundles';
import { productIds } from '../../test/products';
import { tenantA, tenantB } from '../../test/fixtures';
import { routerFixture } from '../../test/router';
import { recipeFixture, recipeIds } from '../../test/recipes';
jest.mock('../basket/BasketProvider', () => ({ useBasket: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn(), Stack: { Screen: () => null } }));
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});
function setup(product = bundleProduct(), patch: Parameters<typeof basketState>[0] = {}) {
  const state = basketState(patch);
  const router = routerFixture();
  jest.mocked(useRouter).mockReturnValue(router);
  jest.mocked(useBasket).mockReturnValue(state);
  const screen = render(<GuidedBundle product={product} details={new Map()} />);
  const next = () => fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  const select = () => {
    fireEvent.press(screen.getByRole('checkbox', { name: 'Meat · Small' }));
    fireEvent.press(screen.getByRole('button', { name: 'Increase Meat · Small quantity' }));
  };
  return { screen, state, router, next, select };
}
it('requires section portions then submits one exact final request with separate parent quantity and notes', async () => {
  const { screen, state, router, next, select } = setup();
  fireEvent.press(screen.getByRole('button', { name: 'Increase Quantity' }));
  next();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Add to basket' })).toBeNull();
  select();
  next();
  expect(screen.getByText('Review your bundle')).toBeTruthy();
  fireEvent.changeText(
    screen.getByLabelText('Instructions for Deux viandes · Meat · Small (optional)'),
    '  No cutlery  ',
  );
  fireEvent.changeText(
    screen.getByLabelText('Instructions for the kitchen (optional)'),
    '  Together  ',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/basket'));
  expect(state.add).toHaveBeenCalledTimes(1);
  expect(state.add).toHaveBeenCalledWith({
    productId: tenantA,
    quantity: 2,
    specialInstructions: 'Together',
    selectedMenuOptions: [
      {
        sectionId: productIds.section,
        menuSectionItemId: productIds.item,
        itemId: tenantB,
        productVariationId: productIds.variation,
        componentProductVariationId: productIds.variation,
        quantity: 2,
        specialInstructions: 'No cutlery',
        selectedIngredients: [],
        ingredientQuantities: {},
        customizationSelections: [],
        selectedSideItems: [],
      },
    ],
  });
});
it('uses the shared nested recipe picker and preserves explicit removals through Back', () => {
  const product = bundleProduct();
  product.menuDefinition!.sections![0]!.items![0]!.detailedIngredients = [
    ...recipeFixture().detailedIngredients!,
  ];
  const { screen, next, select } = setup(product);
  next();
  select();
  next();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Salad' }));
  next();
  next();
  expect(screen.getByText('Without Salad')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('checkbox', { name: 'Salad' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Bread' })).toBeDisabled();
  expect(recipeIds.included).toBe(productIds.item);
});
it('does not offer Add for an inactive required dependent choice', () => {
  const product = dependentBundle();
  product.menuDefinition!.sections![0]!.isRequired = false;
  const { screen, next } = setup(product);
  next();
  next();
  expect(
    screen.getByText(
      'Go back to the dish selection and choose the dish needed for this required choice.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Add to basket' })).toBeNull();
});
it('keeps unknown adds on review and exposes explicit basket recovery', async () => {
  const { screen, next, select, state, router } = setup(bundleProduct(), {
    add: jest.fn(async () => {
      throw new Error('Unknown');
    }),
  });
  next();
  select();
  next();
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open basket' })).toBeTruthy());
  expect(state.add).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});
