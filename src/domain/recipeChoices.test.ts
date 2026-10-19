import { recipeChoices } from './recipeChoices';
import { projectRecipe } from './recipeProjection';
import { changeChoice, validateSelection } from './customization';
import { patchRecipe, recipeFixture, recipeIds as ids, recipeLabels } from '../test/recipes';
import { productDetailFixture } from '../test/products';

it('starts with the complete base recipe and emits explicit zero quantities for omitted active extras', () => {
  const source = recipeFixture();
  const snapshot = JSON.stringify(source);
  const groups = recipeChoices(source, 'en', recipeLabels);
  expect(groups[0]?.defaults).toEqual({ [ids.fixed]: 1, [ids.included]: 1 });
  expect(groups[1]?.defaults).toEqual({});
  expect(projectRecipe(groups, {})).toEqual({
    selectedIngredients: [ids.fixed, ids.included],
    ingredientQuantities: {
      [ids.fixed]: 1,
      [ids.included]: 1,
      [ids.extra]: 0,
      [ids.none]: 0,
      [ids.garlic]: 0,
      [ids.hot]: 0,
    },
  });
  expect(JSON.stringify(source)).toBe(snapshot);
});
it('retains fixed ingredients at one while optional included ingredients can be removed', () => {
  const group = recipeChoices(recipeFixture(), 'en', recipeLabels)[0];
  if (!group) throw new Error('Missing recipe fixture');
  expect(changeChoice(group, group.defaults, ids.fixed, -1)).toBe(group.defaults);
  expect(changeChoice(group, group.defaults, ids.fixed, 1)).toBe(group.defaults);
  expect(validateSelection(group, {})).toBe('invalid');
  expect(changeChoice(group, group.defaults, ids.included, -1)).toEqual({
    [ids.fixed]: 1,
    [ids.included]: 0,
  });
  expect(changeChoice(group, group.defaults, ids.extra, 3)).toMatchObject({ [ids.extra]: 3 });
  expect(changeChoice(group, group.defaults, ids.extra, 4)).toBe(group.defaults);
});
it('counts sauce choices separately from per-sauce quantities', () => {
  const group = recipeChoices({ ...recipeFixture(), sauceMin: 2 }, 'en', recipeLabels)[1];
  if (!group) throw new Error('Missing sauce fixture');
  expect(validateSelection(group, { [ids.garlic]: 3 })).toBe('minimum');
  expect(validateSelection(group, { [ids.garlic]: 2, [ids.hot]: 1 })).toBe('valid');
  expect(() => projectRecipe([group], { sauce: { [ids.garlic]: 3 } })).toThrow('Incomplete');
});
it('preserves zero and unlimited sauce caps rather than substituting a truthy default', () => {
  const zero = recipeChoices({ ...recipeFixture(), sauceMax: 0 }, 'en', recipeLabels)[1];
  const unlimited = recipeChoices({ ...recipeFixture(), sauceMax: null }, 'en', recipeLabels)[1];
  if (!zero || !unlimited) throw new Error('Missing sauce fixtures');
  expect(changeChoice(zero, {}, ids.garlic, 1)).toEqual({});
  expect(validateSelection(unlimited, { [ids.garlic]: 3, [ids.hot]: 2 })).toBe('valid');
});
it('rejects conflicting included defaults rather than silently removing and repricing base rows', () => {
  const includedSauces = patchRecipe((row) =>
    row.id === ids.garlic || row.id === ids.hot ? { ...row, isIncludedInBasePrice: true } : row,
  );
  expect(() => recipeChoices({ ...includedSauces, sauceMax: 1 }, 'en', recipeLabels)).toThrow(
    'base recipe',
  );
  const exclusive = patchRecipe((row) =>
    row.id === ids.included || row.id === ids.extra
      ? { ...row, exclusionGroup: 'choice', isIncludedInBasePrice: true }
      : row,
  );
  expect(() => recipeChoices(exclusive, 'en', recipeLabels)).toThrow('base recipe');
  const none = patchRecipe((row) =>
    row.id === ids.none || row.id === ids.hot ? { ...row, isIncludedInBasePrice: true } : row,
  );
  expect(() => recipeChoices(none, 'en', recipeLabels)).toThrow('base recipe');
});
it('rejects unknown recipe kinds and absent answer metadata, including old bundle responses', () => {
  expect(() =>
    recipeChoices(
      patchRecipe((row) => ({ ...row, kind: 'future' })),
      'en',
      recipeLabels,
    ),
  ).toThrow('contract');
  expect(() =>
    recipeChoices(
      patchRecipe(({ isNoneOption: _old, ...row }) => row),
      'en',
      recipeLabels,
    ),
  ).toThrow('contract');
  expect(() =>
    recipeChoices(
      patchRecipe((row) => ({ ...row, id: null })),
      'en',
      recipeLabels,
    ),
  ).toThrow();
  expect(() =>
    recipeChoices(
      patchRecipe((row) => ({ ...row, id: ids.fixed })),
      'en',
      recipeLabels,
    ),
  ).toThrow('identities');
});
it('does not invent a legacy flow for a product with active explicit groups', () => {
  expect(() => recipeChoices(productDetailFixture(), 'en', recipeLabels)).toThrow('Explicit');
});
it('ignores inactive recipe rows and represents absent recipes without inventing selections', () => {
  expect(
    recipeChoices(
      patchRecipe((row) => ({ ...row, isActive: false })),
      'en',
      recipeLabels,
    ),
  ).toEqual([]);
  expect(
    recipeChoices({ ...recipeFixture(), detailedIngredients: null }, 'en', recipeLabels),
  ).toEqual([]);
  expect(() =>
    recipeChoices(
      { ...recipeFixture(), detailedIngredients: null, sauceMin: 1 },
      'en',
      recipeLabels,
    ),
  ).toThrow();
});
it('does not fabricate a valid quantity for an unavailable included base row', () => {
  expect(() =>
    recipeChoices(
      patchRecipe((row) => (row.id === ids.fixed ? { ...row, maxQuantity: 0 } : row)),
      'en',
      recipeLabels,
    ),
  ).toThrow('base recipe');
  const groups = recipeChoices(
    patchRecipe((row) => (row.id === ids.extra ? { ...row, maxQuantity: 0 } : row)),
    'en',
    recipeLabels,
  );
  expect(groups[0]?.options.find(({ id }) => id === ids.extra)?.available).toBe(false);
});

it('rejects a sauce minimum that cannot be met by mutually exclusive choices', () => {
  const onlyExclusive = patchRecipe((row) =>
    row.kind === 'sauce' ? { ...row, exclusionGroup: 'one-answer' } : row,
  );
  expect(() => recipeChoices({ ...onlyExclusive, sauceMin: 2 }, 'en', recipeLabels)).toThrow(
    'minimum',
  );
  const fixedNone = patchRecipe((row) =>
    row.id === ids.none ? { ...row, isOptional: false } : row,
  );
  expect(() => recipeChoices({ ...fixedNone, sauceMin: 2 }, 'en', recipeLabels)).toThrow('minimum');
});
