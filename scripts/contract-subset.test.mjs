import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerSubset } from './contract-subset.mjs';
import { readFileSync } from 'node:fs';
const reference = (name) => ({ $ref: `#/components/schemas/${name}` });
function fixture() {
  return {
    openapi: '3.0.4',
    security: [{ Bearer: [] }],
    paths: {
      '/api/menu': {
        get: { responses: reference('Menu') },
        post: { responses: reference('Private') },
        parameters: [{ $ref: '#/components/parameters/Locale' }],
      },
      '/api/admin': { get: { responses: reference('Private') } },
    },
    components: {
      schemas: {
        Menu: { properties: { dish: reference('Dish') } },
        Dish: { properties: { parent: reference('Menu') } },
        Private: { type: 'string' },
      },
      parameters: { Locale: { name: 'locale', in: 'query' } },
      securitySchemes: { Bearer: { type: 'http', scheme: 'bearer' } },
    },
  };
}
const selection = { '/api/menu': ['get'] };
test('selects exact customer methods and transitive cyclic schemas, parameters and security', () => {
  const source = fixture();
  const before = JSON.stringify(source);
  const subset = customerSubset(source, selection);
  assert.deepEqual(Object.keys(subset.paths), ['/api/menu']);
  assert.deepEqual(Object.keys(subset.paths['/api/menu']), ['get', 'parameters']);
  assert.deepEqual(Object.keys(subset.components.schemas), ['Dish', 'Menu']);
  assert.deepEqual(subset.components.parameters.Locale, source.components.parameters.Locale);
  assert.deepEqual(subset.security, [{ Bearer: [] }]);
  assert.deepEqual(subset.components.securitySchemes.Bearer, { type: 'http', scheme: 'bearer' });
  assert.equal(JSON.stringify(source), before);
});
test('follows operation-specific security without requiring global security', () => {
  const source = fixture();
  delete source.security;
  source.paths['/api/menu'].get.security = [{ Bearer: [] }];
  assert.ok(customerSubset(source, selection).components.securitySchemes.Bearer);
});
test('handles public responses with no component references or security', () => {
  const source = {
    openapi: '3.0.4',
    paths: { '/api/menu': { get: { responses: { 200: { description: 'OK' } } } } },
  };
  assert.deepEqual(customerSubset(source, selection).components, {});
});
for (const [name, change] of [
  [
    'wrong OpenAPI version',
    (s) => {
      s.openapi = '3.1.0';
    },
  ],
  [
    'dangling reference',
    (s) => {
      delete s.components.schemas.Dish;
    },
  ],
  [
    'remote reference',
    (s) => {
      s.components.schemas.Menu = { $ref: 'https://invalid.example/schema' };
    },
  ],
  [
    'missing security scheme',
    (s) => {
      delete s.components.securitySchemes.Bearer;
    },
  ],
])
  test(`rejects ${name}`, () => {
    const source = fixture();
    change(source);
    assert.throws(() => customerSubset(source, selection));
  });
for (const [name, operations] of [
  ['empty allowlist', {}],
  ['empty methods', { '/api/menu': [] }],
  ['invalid method', { '/api/menu': ['trace'] }],
  ['missing method', { '/api/menu': ['delete'] }],
  ['missing route', { '/api/missing': ['get'] }],
  ['non-API route', { '/menu': ['get'] }],
  ['non-array methods', { '/api/menu': 'get' }],
])
  test(`rejects ${name}`, () => assert.throws(() => customerSubset(fixture(), operations)));

test('committed snapshot contains exactly the allowlisted operations and reachable components', () => {
  const snapshot = JSON.parse(readFileSync('contracts/customer.openapi.json', 'utf8'));
  const operations = JSON.parse(readFileSync('contracts/customer-operations.json', 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(customerSubset(snapshot, operations))), snapshot);
});
