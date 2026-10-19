import '../../i18n';
import type { ProductDetail } from '../../api/productDetail';
import { act, renderHook } from '@testing-library/react-native';
import useProductDraft from './useProductDraft';
import { compositionProduct } from '../../test/compositions';
import { recipeIds } from '../../test/recipes';
it('keeps quantity and choices when moving back through the authored flow', () => {
  const product = compositionProduct();
  const details = new Map<string, ProductDetail>();
  const hook = renderHook(() => useProductDraft(product, details));
  act(() => hook.result.current.change({ quantity: 3, instructions: 'Cut in half' }));
  act(() => hook.result.current.next());
  expect(hook.result.current.step?.kind).toBe('variation');
  act(() => hook.result.current.back());
  expect(hook.result.current.step?.kind).toBe('quantity');
  expect(hook.result.current.selection).toMatchObject({ quantity: 3, instructions: 'Cut in half' });
});
it('resets to fresh defaults and warns when menu metadata changes', () => {
  const original = compositionProduct();
  const details = new Map<string, ProductDetail>();
  const hook = renderHook(
    ({ product }: { product: ProductDetail }) => useProductDraft(product, details),
    {
      initialProps: { product: original },
    },
  );
  act(() =>
    hook.result.current.change({
      quantity: 2,
      groups: { recipe: { [recipeIds.fixed]: 1, [recipeIds.included]: 0 }, sauce: {} },
    }),
  );
  act(() => hook.result.current.next());
  hook.rerender({ product: { ...original, name: 'Updated dish' } });
  expect(hook.result.current.index).toBe(0);
  expect(hook.result.current.changed).toBe(true);
  expect(hook.result.current.selection?.groups.recipe?.[recipeIds.included]).toBe(1);
  expect(hook.result.current.selection?.quantity).toBe(1);
});
it('blocks unsupported rules and final validation even after a previously valid menu', () => {
  const details = new Map<string, ProductDetail>();
  const hook = renderHook(
    ({ product }: { product: ProductDetail }) => useProductDraft(product, details),
    {
      initialProps: { product: compositionProduct() },
    },
  );
  act(() => hook.result.current.change({ instructions: 'x'.repeat(501) }));
  expect(hook.result.current.valid).toBe(false);
  hook.rerender({
    product: {
      ...compositionProduct(),
      customerStepManifest: { schemaVersion: 2, revision: 1, steps: [] },
    },
  });
  expect(hook.result.current.plan).toBeUndefined();
  expect(hook.result.current.complete).toBe(false);
  expect(hook.result.current.valid).toBe(false);
});
