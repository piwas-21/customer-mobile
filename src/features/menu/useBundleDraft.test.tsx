import '../../i18n';
import { act, renderHook } from '@testing-library/react-native';
import type { ProductDetail } from '../../api/productDetail';
import useBundleDraft from './useBundleDraft';
import { bundleProduct } from '../../test/bundles';
import { productIds } from '../../test/products';
it('keeps selected per-bundle portions while navigating, then resets on fresh metadata', () => {
  const product = bundleProduct();
  const details = new Map<string, ProductDetail>();
  const { result, rerender } = renderHook(
    ({ value }: { value: ProductDetail }) => useBundleDraft(value, details),
    {
      initialProps: { value: product },
    },
  );
  act(() => result.current.change({ quantity: 3, instructions: 'Private note' }));
  act(() => result.current.next());
  expect(result.current.step?.kind).toBe('section');
  expect(result.current.complete).toBe(false);
  act(() =>
    result.current.change({ sections: { [productIds.section]: { [productIds.item]: 2 } } }),
  );
  act(() => result.current.next());
  expect(result.current.step?.kind).toBe('review');
  expect(result.current.valid).toBe(true);
  act(() => result.current.back());
  expect(result.current.selection?.sections[productIds.section]?.[productIds.item]).toBe(2);
  rerender({ value: { ...product } });
  expect(result.current.index).toBe(0);
  expect(result.current.selection?.instructions).toBe('');
  expect(result.current.selection?.quantity).toBe(1);
  expect(result.current.changed).toBe(true);
});
it('refuses unsupported nested choices without throwing from a press handler', () => {
  const product = bundleProduct();
  product.menuDefinition!.sections![0]!.items![0]!.customizationGroups = [
    {
      id: productIds.group,
      authoringVersion: 2,
      name: 'Future group',
      isActive: true,
      minSelection: 0,
      maxSelection: 1,
      includedFreeUnits: 0,
      isRequired: false,
      displayOrder: 0,
      content: null,
      ingredientOptions: [],
      productOptions: [],
    },
  ];
  const details = new Map<string, ProductDetail>();
  const { result } = renderHook(() => useBundleDraft(product, details));
  expect(result.current.plan).toBeDefined();
  act(() =>
    result.current.change({ sections: { [productIds.section]: { [productIds.item]: 2 } } }),
  );
  expect(result.current.unsupported).toBe(true);
  expect(result.current.valid).toBe(false);
  expect(result.current.complete).toBe(false);
  act(() => result.current.change({ sections: {} }));
  expect(result.current.unsupported).toBe(false);
});
it('fails closed for unavailable roots and future authored manifests', () => {
  const product = bundleProduct();
  product.isAvailable = false;
  const details = new Map<string, ProductDetail>();
  const { result, rerender } = renderHook(
    ({ value }: { value: ProductDetail }) => useBundleDraft(value, details),
    {
      initialProps: { value: product },
    },
  );
  expect(result.current.plan).toBeUndefined();
  act(() => result.current.next());
  act(() => result.current.change({ quantity: 2 }));
  expect(result.current.valid).toBe(false);
  rerender({
    value: {
      ...product,
      isAvailable: true,
      customerStepManifest: { schemaVersion: 2, revision: 0, steps: [] },
    },
  });
  expect(result.current.plan).toBeUndefined();
});
