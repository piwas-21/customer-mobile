import { recipeChoices } from './recipeChoices';
import { projectRecipe } from './recipeProjection';
import { changeChoice, validateSelection } from './customization';
import { patchRecipe, recipeFixture, recipeIds as ids, recipeLabels } from '../test/recipes';

it('uses the none marker, never a label, to make the answer exclusive within its kind', () => {
  const groups = recipeChoices(recipeFixture(), 'en', recipeLabels);
  const sauces = groups[1];
  if (!sauces) throw new Error('Missing sauce fixture');
  const none = changeChoice(sauces, { [ids.garlic]: 2, [ids.hot]: 1 }, ids.none, 1);
  expect(none).toEqual({ [ids.garlic]: 0, [ids.hot]: 0, [ids.none]: 1 });
  const garlic = changeChoice(sauces, none, ids.garlic, 1);
  expect(garlic).toEqual({ [ids.garlic]: 1, [ids.hot]: 0, [ids.none]: 0 });
  const misleadingName = changeChoice(sauces, { [ids.garlic]: 1 }, ids.hot, 1);
  expect(misleadingName).toEqual({ [ids.garlic]: 1, [ids.hot]: 1 });
  expect(validateSelection(sauces, { [ids.none]: 1, [ids.garlic]: 1 })).toBe('invalid');
  expect(projectRecipe(groups, { sauce: none }).selectedIngredients).toEqual([
    ids.fixed,
    ids.included,
    ids.none,
  ]);
});
it('normalizes exclusion keys and replaces only the matching choice', () => {
  const source = patchRecipe((row) =>
    row.id === ids.included
      ? { ...row, exclusionGroup: ' choice ' }
      : row.id === ids.extra
        ? { ...row, exclusionGroup: 'choice' }
        : row,
  );
  const group = recipeChoices(source, 'en', recipeLabels)[0];
  if (!group) throw new Error('Missing recipe fixture');
  expect(changeChoice(group, group.defaults, ids.extra, 1)).toEqual({
    [ids.fixed]: 1,
    [ids.included]: 0,
    [ids.extra]: 1,
  });
  expect(validateSelection(group, { [ids.fixed]: 1, [ids.included]: 1, [ids.extra]: 1 })).toBe(
    'invalid',
  );
  const ungrouped = recipeChoices(
    patchRecipe((row) => ({ ...row, exclusionGroup: '  ' })),
    'en',
    recipeLabels,
  )[0];
  if (!ungrouped) throw new Error('Missing fixture');
  expect(changeChoice(ungrouped, ungrouped.defaults, ids.extra, 1)).toMatchObject({
    [ids.included]: 1,
    [ids.extra]: 1,
  });
});
it('does not remove a fixed ingredient as a side effect of an exclusive answer', () => {
  const source = patchRecipe((row) =>
    row.id === ids.extra ? { ...row, isNoneOption: true } : row,
  );
  const group = recipeChoices(source, 'en', recipeLabels)[0];
  if (!group) throw new Error('Missing fixture');
  expect(changeChoice(group, group.defaults, ids.extra, 1)).toBe(group.defaults);
});
it('projects removed included ingredients explicitly and refuses foreign or stale recipe state', () => {
  const groups = recipeChoices(recipeFixture(), 'en', recipeLabels);
  const result = projectRecipe(groups, {
    recipe: { [ids.fixed]: 1, [ids.included]: 0, [ids.extra]: 2 },
  });
  expect(result.selectedIngredients).toEqual([ids.fixed, ids.extra]);
  expect(result.ingredientQuantities).toMatchObject({ [ids.included]: 0, [ids.extra]: 2 });
  expect(() => projectRecipe(groups, { foreign: {} })).toThrow('scope');
  expect(() => projectRecipe(groups, { recipe: { [ids.fixed]: 1, foreign: 0 } })).toThrow(
    'Incomplete',
  );
  expect(() =>
    projectRecipe(
      groups.map((group) => ({ ...group, kind: 'explicit' })),
      {},
    ),
  ).toThrow('scope');
});
it('refuses duplicate target identities or a foreign option kind during projection', () => {
  const groups = recipeChoices(recipeFixture(), 'en', recipeLabels);
  expect(() => projectRecipe([...groups, ...groups], {})).toThrow('identity');
  expect(() =>
    projectRecipe(
      groups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({ ...option, kind: 'product' })),
      })),
      {},
    ),
  ).toThrow('identity');
});

it('treats the no-ingredient answer as one choice instead of offering repeated negative portions', () => {
  const group = recipeChoices(recipeFixture(), 'en', recipeLabels)[1];
  if (!group) throw new Error('Missing sauce fixture');
  const answer = { [ids.none]: 1 };
  expect(validateSelection(group, { [ids.none]: 2 })).toBe('invalid');
  expect(changeChoice(group, answer, ids.none, 1)).toBe(answer);
});
