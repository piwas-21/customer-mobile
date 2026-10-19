import '../../i18n';
import type { ProductDetail } from '../../api/productDetail';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import GuidedProduct from './GuidedProduct';
import { useBasket } from '../basket/BasketProvider';
import { basketState } from '../../test/basketState';
import { compositionProduct } from '../../test/compositions';
import { recipeIds } from '../../test/recipes';
import { productIds } from '../../test/products';
import { tenantA } from '../../test/fixtures';
import { routerFixture } from '../../test/router';
jest.mock('../basket/BasketProvider', () => ({ useBasket: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn(), Stack: { Screen: () => null } }));
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});
function setup(patch: Parameters<typeof basketState>[0] = {}) {
  const state = basketState(patch);
  const router = routerFixture();
  jest.mocked(useRouter).mockReturnValue(router);
  jest.mocked(useBasket).mockReturnValue(state);
  const product = compositionProduct();
  const details = new Map<string, ProductDetail>();
  const screen = render(<GuidedProduct product={product} details={details} />);
  const review = () => {
    let next = screen.queryByRole('button', { name: 'Next' });
    let steps = 0;
    while (next && steps++ < 10) {
      fireEvent.press(next);
      next = screen.queryByRole('button', { name: 'Next' });
    }
    expect(screen.getByText('Review your dish')).toBeTruthy();
  };
  return { state, router, screen, review, product, details };
}
it('offers only Next until review, then submits one exact request with fixed recipe defaults', async () => {
  const { screen, state, router, review } = setup();
  expect(screen.queryByRole('button', { name: 'Add to basket' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Increase Quantity' }));
  review();
  fireEvent.changeText(
    screen.getByLabelText('Instructions for the kitchen (optional)'),
    '  Cut in half  ',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/basket'));
  expect(state.add).toHaveBeenCalledTimes(1);
  expect(state.add).toHaveBeenCalledWith({
    productId: tenantA,
    quantity: 2,
    productVariationId: productIds.variation,
    specialInstructions: 'Cut in half',
    selectedIngredients: [recipeIds.fixed, recipeIds.included],
    ingredientQuantities: {
      [recipeIds.fixed]: 1,
      [recipeIds.included]: 1,
      [recipeIds.extra]: 0,
      [recipeIds.none]: 0,
      [recipeIds.garlic]: 0,
      [recipeIds.hot]: 0,
    },
    customizationSelections: [],
    selectedSideItems: [],
  });
});
it('retains choices when Back returns to the previous step and disables a pending add', () => {
  const { screen, review, state } = setup({ hasPending: true, canAdd: false });
  review();
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.queryByText('Review your dish')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Add to basket' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  expect(state.add).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Open basket' })).toBeTruthy();
});
it('keeps an unknown outcome on review and provides basket recovery access', async () => {
  const { screen, state, router, review } = setup({
    add: jest.fn(async () => {
      throw new Error('Unknown');
    }),
  });
  review();
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  await waitFor(() =>
    expect(
      screen.getByText(
        'We could not confirm the add. Open your basket to check before trying another dish.',
      ),
    ).toBeTruthy(),
  );
  expect(state.add).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Open basket' }));
  expect(router.push).toHaveBeenCalledWith('/basket');
});
it('does not redirect from an unmounted configuration after acceptance', async () => {
  let release!: () => void;
  const accepted = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { screen, router, review } = setup({ add: () => accepted });
  review();
  fireEvent.press(screen.getByRole('button', { name: 'Add to basket' }));
  screen.unmount();
  await act(async () => {
    release();
    await accepted;
  });
  expect(router.replace).not.toHaveBeenCalled();
});
