import { bundleChoices } from './bundleChoices';
import { projectBundleChoice, projectExplicitChoice } from './choiceProjection';
import { validateSelection, changeChoice } from './customization';
import { bundleDetailFixture, productIds } from '../test/products';
import type { ProductDetail } from '../api/productDetail';
import { tenantB } from '../test/fixtures';

type Section = NonNullable<NonNullable<ProductDetail['menuDefinition']>['sections']>[number];
function choicesFor(sections: readonly Section[] | null, locale: string) {
  const definition = bundleDetailFixture().menuDefinition;
  if (!definition) throw new Error('Missing bundle fixture');
  return bundleChoices({ ...definition, sections: sections ? [...sections] : null }, locale);
}
function fixture() {
  const source = bundleDetailFixture().menuDefinition?.sections?.[0];
  const item = source?.items?.[0];
  if (!source || !item) throw new Error('Missing section fixture');
  const row = { ...item, availability: { canOrder: true } };
  return { section: { ...source, items: [row] }, row };
}
it('counts repeated bundle portions and projects the exact section-row and fixed variation', () => {
  const { section } = fixture();
  const group = choicesFor([section], 'fr')[0];
  if (!group) throw new Error('Missing fixture');
  expect(group.label).toBe('Deux viandes');
  expect(validateSelection(group, { [productIds.item]: 1 })).toBe('minimum');
  expect(validateSelection(group, { [productIds.item]: 2 })).toBe('valid');
  expect(projectBundleChoice(group, { [productIds.item]: 2 })).toEqual([
    {
      sectionId: productIds.section,
      menuSectionItemId: productIds.item,
      itemId: tenantB,
      productVariationId: productIds.variation,
      quantity: 2,
    },
  ]);
  const full = { [productIds.item]: 2 };
  expect(changeChoice(group, full, productIds.item, 1)).toBe(full);
  expect(() => projectExplicitChoice(group, full)).toThrow('scope');
});
it('keeps duplicate-product rows separate and counts distinct non-repeatable selections', () => {
  const { section, row } = fixture();
  const group = choicesFor(
    [{ ...section, allowRepeatedItems: false, items: [row, { ...row, id: productIds.sideLink }] }],
    'en',
  )[0];
  if (!group) throw new Error('Missing fixture');
  expect(validateSelection(group, { [productIds.item]: 2 })).toBe('invalid');
  const selection = { [productIds.item]: 1, [productIds.sideLink]: 1 };
  expect(validateSelection(group, selection)).toBe('valid');
  expect(
    projectBundleChoice(group, selection).map(({ menuSectionItemId }) => menuSectionItemId),
  ).toEqual([productIds.item, productIds.sideLink]);
  expect(() => projectBundleChoice(group, { [tenantB]: 2 })).toThrow('Incomplete');
});
it('treats optional section minima as presentation while retaining the maximum', () => {
  const { section } = fixture();
  const group = choicesFor([{ ...section, isRequired: false }], 'en')[0];
  if (!group) throw new Error('Missing fixture');
  expect(validateSelection(group, {})).toBe('valid');
  expect(projectBundleChoice(group, {})).toEqual([]);
});
it('does not seed an unavailable row or an inactive/missing fixed variation', () => {
  const { section, row } = fixture();
  const sources = [
    { ...row, availability: { canOrder: false } },
    {
      ...row,
      variations: row.variations?.map((variation) => ({ ...variation, isActive: false })) ?? [],
    },
    { ...row, variations: null },
  ];
  for (const source of sources) {
    const group = choicesFor([{ ...section, items: [{ ...source, isDefault: true }] }], 'en')[0];
    if (!group) throw new Error('Missing fixture');
    expect(group.defaults).toEqual({});
    expect(validateSelection(group, { [row.id]: 1 })).toBe('invalid');
  }
});
it('sorts defaults deterministically, caps them and preserves source order', () => {
  const { section, row } = fixture();
  const source = [
    {
      ...section,
      minSelection: 0,
      maxSelection: 1,
      items: [
        { ...row, isDefault: true, displayOrder: 5 },
        { ...row, id: productIds.sideLink, isDefault: true, displayOrder: 0 },
      ],
    },
  ];
  const snapshot = JSON.stringify(source);
  const group = choicesFor(source, 'en')[0];
  expect(group?.defaults).toEqual({ [productIds.sideLink]: 1 });
  expect(JSON.stringify(source)).toBe(snapshot);
});
it('supports a base row without fixed variation and explicit zero-cap optional sections', () => {
  const { section, row } = fixture();
  const group = choicesFor(
    [
      {
        ...section,
        isRequired: false,
        maxSelection: 0,
        items: [
          {
            ...row,
            productVariationId: null,
            productVariationName: null,
            variations: null,
            isDefault: true,
          },
        ],
      },
    ],
    'en',
  )[0];
  expect(group?.defaults).toEqual({});
  expect(group?.options[0]?.available).toBe(true);
  expect(group?.options[0]?.label).toBe('Meat');
  expect(choicesFor(null, 'en')).toEqual([]);
});
it('refuses ambiguous group or row identities rather than binding to the first matching product', () => {
  const { section, row } = fixture();
  expect(() => choicesFor([section, section], 'en')).toThrow('identities');
  expect(() => choicesFor([{ ...section, items: [row, row] }], 'en')).toThrow('rules');
  expect(() => choicesFor([{ ...section, minSelection: 3, maxSelection: 2 }], 'en')).toThrow(
    'rules',
  );
  const empty = choicesFor([{ ...section, items: null }], 'en')[0];
  if (!empty) throw new Error('Missing fixture');
  expect(validateSelection(empty, {})).toBe('minimum');
});

it('blocks future bundle authoring versions before a selection payload can be projected', () => {
  const definition = bundleDetailFixture().menuDefinition;
  if (!definition) throw new Error('Missing bundle fixture');
  expect(() => bundleChoices({ ...definition, authoringVersion: 2 }, 'en')).toThrow('version');
  expect(bundleChoices(null, 'en')).toEqual([]);
});
