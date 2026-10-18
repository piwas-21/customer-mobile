import { explicitChoices } from './explicitChoices';
import { projectExplicitChoice, projectBundleChoice } from './choiceProjection';
import { changeChoice, validateSelection } from './customization';
import { productDetailFixture, productIds } from '../test/products';
import { tenantB } from '../test/fixtures';

function fixture() {
  const product = productDetailFixture();
  const source = product.customizationGroups?.[0];
  if (!source) throw new Error('Missing group fixture');
  const ingredients = product.detailedIngredients;
  const groups: [typeof source] = [{ ...source, content: { fr: { name: 'Deux choix' } } }];
  const group = explicitChoices(groups, ingredients, 'fr')[0];
  if (!group) throw new Error('Missing projected group');
  return { group, groups, ingredients };
}
it('counts distinct explicit choices, never repeated ingredient quantity as multiple choices', () => {
  const { group } = fixture();
  const ingredient = `ingredient:${productIds.item}`;
  expect(group.label).toBe('Deux choix');
  expect(group.options[0]).toMatchObject({
    id: ingredient,
    targetId: productIds.ingredient,
    membershipId: productIds.item,
    maxQuantity: 3,
  });
  expect(validateSelection(group, { [ingredient]: 3 })).toBe('minimum');
  expect(validateSelection(group, { [ingredient]: 4 })).toBe('invalid');
  expect(changeChoice(group, {}, ingredient, 3)).toEqual({ [ingredient]: 3 });
  expect(validateSelection({ ...group, min: 1, max: 1 }, { [ingredient]: 3 })).toBe('valid');
  expect(validateSelection(group, { [ingredient]: 0 })).toBe('minimum');
});
it('projects membership identities and exact wire enum values, not target product/ingredient IDs', () => {
  const { groups, ingredients } = fixture();
  const source = groups[0];
  const group = explicitChoices(
    [
      {
        ...source,
        productOptions:
          source?.productOptions?.map((option) => ({
            ...option,
            optionProductIsAvailable: true,
            availability: { canOrder: true },
          })) ?? [],
      },
    ],
    ingredients,
    'en',
  )[0];
  if (!group) throw new Error('Missing fixture');
  expect(
    projectExplicitChoice(group, {
      [`ingredient:${productIds.item}`]: 3,
      [`product:${productIds.sideLink}`]: 1,
    }),
  ).toEqual({
    groupId: productIds.group,
    options: [
      { kind: 'Ingredient', optionId: productIds.item, quantity: 3 },
      { kind: 'Product', optionId: productIds.sideLink, quantity: 1 },
    ],
  });
  expect(group.options[1]?.targetId).toBe(tenantB);
  expect(() => projectBundleChoice(group, {})).toThrow('scope');
});
it('does not offer unavailable products or accept quantity two for a product membership', () => {
  const { group } = fixture();
  const option = `product:${productIds.sideLink}`;
  expect(validateSelection(group, { [option]: 1 })).toBe('invalid');
  const available = {
    ...group,
    min: 0,
    options: group.options.map((item) => ({ ...item, available: true })),
  };
  expect(validateSelection(available, { [option]: 2 })).toBe('invalid');
  expect(() => projectExplicitChoice(group, {})).toThrow('Incomplete');
  expect(validateSelection(group, { 'ingredient:foreign-membership': 1 })).toBe('invalid');
});
it('keeps explicit minima even when the separate isRequired presentation flag is false', () => {
  const { groups, ingredients } = fixture();
  const group = explicitChoices(
    groups.map((source) => ({ ...source, isRequired: false })),
    ingredients,
    'en',
  )[0];
  if (!group) throw new Error('Missing fixture');
  expect(validateSelection(group, {})).toBe('minimum');
});
it('orders mixed option kinds together and caps defaults without mutating source', () => {
  const { groups, ingredients } = fixture();
  const source = groups[0];
  const input = [
    {
      ...source,
      minSelection: 0,
      maxSelection: 1,
      ingredientOptions:
        source?.ingredientOptions?.map((option) => ({
          ...option,
          isDefault: true,
          displayOrder: 2,
        })) ?? [],
      productOptions:
        source?.productOptions?.map((option) => ({
          ...option,
          isDefault: true,
          displayOrder: 0,
          optionProductIsAvailable: true,
          availability: { canOrder: true },
        })) ?? [],
    },
  ];
  const snapshot = JSON.stringify(input);
  const group = explicitChoices(input, ingredients, 'en')[0];
  expect(group?.options[0]?.kind).toBe('product');
  expect(group?.defaults).toEqual({ [`product:${productIds.sideLink}`]: 1 });
  expect(JSON.stringify(input)).toBe(snapshot);
});
it('refuses missing, ambiguous and unknown rule identities instead of dropping the decision', () => {
  const { groups, ingredients } = fixture();
  const source = groups[0];
  expect(() => explicitChoices([{ ...source, id: null }], ingredients, 'en')).toThrow();
  expect(() => explicitChoices(groups, null, 'en')).toThrow();
  expect(() =>
    explicitChoices(groups, ingredients?.map((item) => ({ ...item, kind: 'Future' })) ?? [], 'en'),
  ).toThrow();
  expect(() => explicitChoices([...groups, ...groups], ingredients, 'en')).toThrow();
  expect(() =>
    explicitChoices([{ ...source, minSelection: 4, maxSelection: 2 }], ingredients, 'en'),
  ).toThrow();
  expect(() =>
    explicitChoices(
      [
        {
          ...source,
          ingredientOptions: [
            ...(source?.ingredientOptions ?? []),
            ...(source?.ingredientOptions ?? []),
          ],
        },
      ],
      ingredients,
      'en',
    ),
  ).toThrow();
});
it('treats absent/inactive groups as no explicit flow and does not invent defaults for inactive ingredients', () => {
  expect(explicitChoices(null, null, 'en')).toEqual([]);
  const { groups, ingredients } = fixture();
  expect(
    explicitChoices(
      groups.map((source) => ({ ...source, isActive: false, id: null })),
      ingredients,
      'en',
    ),
  ).toEqual([]);
  const group = explicitChoices(
    groups.map((source) => ({
      ...source,
      ingredientOptions:
        source.ingredientOptions?.map((option) => ({ ...option, isDefault: true })) ?? null,
    })),
    ingredients?.map((item) => ({ ...item, isActive: false })) ?? null,
    'en',
  )[0];
  expect(group?.defaults).toEqual({});
});

it('blocks future explicit group versions before producing selectable memberships', () => {
  const { groups, ingredients } = fixture();
  expect(() =>
    explicitChoices(
      groups.map((group) => ({ ...group, authoringVersion: 2 })),
      ingredients,
      'en',
    ),
  ).toThrow('version');
});
