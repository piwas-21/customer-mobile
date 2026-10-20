import { reorderCandidates, applyReorderSeed } from './reorder';
import { checkoutLine } from '../test/checkoutQuote';
import { tenantA, tenantB } from '../test/fixtures';
it('copies only the original quantity and instructions into a fresh current selection', () => {
  const old = {
    ...checkoutLine(),
    quantity: 3,
    specialInstructions: 'Keep separate',
    productVariationId: tenantA,
    unitPrice: 999,
    itemTotal: 2997,
  };
  const candidate = reorderCandidates([old])[0]!;
  expect(candidate.seed).toEqual({ quantity: 3, instructions: 'Keep separate' });
  const current = {
    quantity: 1,
    instructions: '',
    variationId: tenantB,
    groups: { current: { option: 1 } },
    sides: {},
  };
  expect(applyReorderSeed(current, candidate.seed!)).toEqual({
    ...current,
    quantity: 3,
    instructions: 'Keep separate',
  });
  expect(current.quantity).toBe(1);
  expect(Object.isFrozen(candidate.seed)).toBe(true);
});
it('keeps repeated roots separate and never creates candidates from child snapshot rows', () => {
  const root = { ...checkoutLine(), quantity: 1 };
  const candidates = reorderCandidates([
    { ...root, children: [root] },
    { ...root, quantity: 2 },
  ]);
  expect(candidates.map(({ key, productId, quantity }) => ({ key, productId, quantity }))).toEqual([
    { key: '0', productId: tenantA, quantity: 1 },
    { key: '1', productId: tenantA, quantity: 2 },
  ]);
});
it.each([null, undefined, 'not-a-uuid'])(
  'does not infer a current product from legacy reference %s',
  (productId) => {
    expect(reorderCandidates([{ ...checkoutLine(), productId }])[0]).toMatchObject({
      productId: null,
      seed: null,
    });
  },
);
it.each([{ quantity: 0 }, { quantity: 100000 }, { specialInstructions: 'x'.repeat(501) }])(
  'refuses unsupported historical input instead of silently changing it',
  (patch) => {
    expect(reorderCandidates([{ ...checkoutLine(), ...patch }])[0]?.seed).toBeNull();
  },
);
it('leaves ordinary new-order defaults unchanged and refuses extra seed fields', () => {
  const current = { quantity: 1, instructions: '' };
  expect(applyReorderSeed(current, undefined)).toBe(current);
  const hostile = { quantity: 2, instructions: '', unitPrice: 0 };
  expect(() => applyReorderSeed(current, hostile)).toThrow();
});
