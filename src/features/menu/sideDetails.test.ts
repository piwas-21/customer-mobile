import { readSideDetails, sideProductIds } from './sideDetails';
import { bundleProduct } from '../../test/bundles';
import { compositionProduct } from '../../test/compositions';
import { tenantA, tenantB } from '../../test/fixtures';
import { productIds } from '../../test/products';
it('deduplicates direct and nested side products while retaining association identities elsewhere', () => {
  const product = bundleProduct();
  product.suggestedSideItems = [
    {
      id: tenantB,
      suggestedSideItemId: productIds.sideLink,
      name: 'Drink',
      price: 2,
      type: 'beverage',
      isRequired: false,
      displayOrder: 0,
    },
  ];
  product.menuDefinition!.sections![0]!.items![0]!.suggestedSideItems = [
    {
      id: productIds.item,
      sideItemProductId: tenantB,
      sideItemProductName: 'Same drink',
      sideItemBasePrice: 2,
      sideItemProductType: 'beverage',
      availability: { canOrder: true },
      variations: [],
      isRequired: false,
      displayOrder: 0,
    },
  ];
  expect(sideProductIds(product)).toEqual([tenantB]);
  expect(sideProductIds(compositionProduct())).toEqual([]);
});
it('bounds concurrent reads at four and captures the deduplicated ID list before awaiting', async () => {
  const ids = Array.from(
    { length: 9 },
    (_, index) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
  );
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0;
  let peak = 0;
  const read = jest.fn(async (id: string) => {
    active++;
    peak = Math.max(peak, active);
    await gate;
    active--;
    return { ...compositionProduct(), id };
  });
  const input = [...ids, ids[0]!];
  const pending = readSideDetails(input, read);
  expect(read).toHaveBeenCalledTimes(4);
  input[0] = tenantA;
  release();
  const details = await pending;
  expect(peak).toBe(4);
  expect(read).toHaveBeenCalledTimes(9);
  expect([...details.keys()]).toEqual(ids);
  expect(details.has(tenantA)).toBe(false);
});
it('does no work for an empty list and rejects invalid/over-budget identities before dispatch', async () => {
  const read = jest.fn(async () => compositionProduct());
  expect(await readSideDetails([], read)).toEqual(new Map());
  await expect(readSideDetails(['invalid'], read)).rejects.toThrow();
  const many = Array.from(
    { length: 101 },
    (_, index) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
  );
  await expect(readSideDetails(many, read)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it('rejects a wrong-product detail instead of sharing its choices with another membership', async () => {
  await expect(readSideDetails([tenantB], async () => compositionProduct())).rejects.toThrow(
    'Wrong side',
  );
});
