import { EntrySelection, resolveLink } from './links';
import { fixtureDirectory, tenantA, tenantB } from '../test/fixtures';
const origin = 'https://links.example';
it('resolves tenant references only through the trusted directory', () => {
  expect(resolveLink(`${origin}/r/alpha/menu`, origin, fixtureDirectory())).toEqual({
    tenantId: tenantA,
    destination: 'menu',
  });
  expect(
    resolveLink(
      `${origin}/r/alpha/payment-return/${tenantA}?operation=${tenantB}`,
      origin,
      fixtureDirectory(),
    ),
  ).toEqual({
    tenantId: tenantA,
    destination: 'payment-return',
    reference: tenantA,
    operationId: tenantB,
  });
});
it.each([
  'https://evil.example/r/alpha/menu',
  `${origin}/r/unknown/menu`,
  `${origin}/r/alpha/admin`,
  `${origin}/r/alpha/menu?token=secret`,
  `${origin}/r/alpha/menu#access`,
  `${origin}/r/alpha/order/%2F`,
  `${origin}/r/alpha/menu?operation=x`,
  `${origin}/r/alpha/menu/one/extra`,
  `${origin}/wrong/alpha/menu`,
])('rejects malicious or unknown entry %s', (value) => {
  expect(() => resolveLink(value, origin, fixtureDirectory())).toThrow();
});
it('consumes install referrer once and gives explicit selection precedence', () => {
  const first = new EntrySelection();
  expect(first.consumeReferrer('tenant=alpha')).toBe('alpha');
  expect(first.consumeReferrer('tenant=beta')).toBeUndefined();
  const selected = new EntrySelection();
  selected.explicit();
  expect(selected.consumeReferrer('tenant=alpha')).toBeUndefined();
  expect(new EntrySelection().consumeReferrer('tenant=https://evil.example')).toBeUndefined();
  expect(new EntrySelection().consumeReferrer('')).toBeUndefined();
});

it.each([
  `${origin}/r/alpha/payment-return?operation=${tenantB}`,
  `${origin}/r/alpha/payment-return/${tenantA}`,
  `${origin}/r/alpha/payment-return/${tenantA}?operation=op-1`,
  `${origin}/r/alpha/payment-return/${tenantA}?operation=${tenantB}&operation=${tenantB}`,
  `${origin}/r/alpha/payment-return/${tenantA}?operation=${tenantB}&paid=true`,
])('rejects missing or ambiguous payment navigation %s', (value) => {
  expect(() => resolveLink(value, origin, fixtureDirectory())).toThrow();
});
