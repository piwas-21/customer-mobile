import type { ProductDetail } from '../api/productDetail';
import type { BundleSelections } from '../domain/bundleComposition';
import { bundleDetailFixture, productIds } from './products';
export const bundleIds = {
  dependent: '99999999-9999-4999-8999-999999999999',
  dependentRow: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
export function bundleProduct(): ProductDetail {
  const product = bundleDetailFixture();
  return {
    ...product,
    variations: [],
    detailedIngredients: [],
    customizationGroups: [],
    suggestedSideItems: [],
    customerStepManifest: null,
    menuDefinition: {
      ...product.menuDefinition!,
      sections: product.menuDefinition!.sections!.map((section) => ({
        ...section,
        items: section.items!.map((item) => ({
          ...item,
          availability: { canOrder: true },
          detailedIngredients: [],
          customizationGroups: [],
          suggestedSideItems: [],
          sauceMin: 0,
        })),
      })),
    },
  };
}
export function bundleSelection(): BundleSelections {
  return {
    quantity: 3,
    instructions: '  Together please  ',
    sections: { [productIds.section]: { [productIds.item]: 2 } },
    components: {},
  };
}
export function dependentBundle(): ProductDetail {
  const product = bundleProduct();
  const section = product.menuDefinition!.sections![0]!;
  return {
    ...product,
    menuDefinition: {
      ...product.menuDefinition!,
      sections: [
        section,
        {
          ...section,
          id: bundleIds.dependent,
          displayOrder: 1,
          minSelection: 1,
          maxSelection: 1,
          items: [{ ...section.items![0]!, id: bundleIds.dependentRow }],
        },
      ],
    },
    customerStepManifest: {
      schemaVersion: 1,
      revision: 1,
      steps: [
        {
          kind: 'BundleSection',
          targetId: productIds.section,
          compositionRole: 'Dish',
          presentationOrder: 0,
        },
        {
          kind: 'BundleSection',
          targetId: bundleIds.dependent,
          parentComponentId: productIds.item,
          compositionRole: 'RequiredChoice',
          presentationOrder: 1,
        },
      ],
    },
  };
}
