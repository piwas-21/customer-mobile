import { test } from 'node:test';
import assert from 'node:assert/strict';
import guard from './patches/braces-ast-guard.cjs';
test('bounded AST helper permits ordinary trees and rejects hostile direct callers', () => {
  assert.doesNotThrow(() => guard.validateAst({ nodes: [{ type: 'text', value: 'dish' }] }));
  assert.doesNotThrow(() => guard.assertDepth(64));
  assert.throws(() => guard.assertDepth(65), /maximum AST depth/);
  assert.throws(() => guard.validateAst(null), /invalid AST node/);
  assert.throws(() => guard.validateAst({ nodes: 'wrong' }), /invalid AST children/);
  const repeated = {};
  assert.throws(() => guard.validateAst({ nodes: [repeated, repeated] }), /cyclic or reused/);
  assert.throws(
    () => guard.validateAst({ nodes: Array.from({ length: 20001 }, () => ({})) }),
    /maximum AST size/,
  );
  let deep = {};
  for (let index = 0; index < 65; index++) deep = { nodes: [deep] };
  assert.throws(() => guard.validateAst(deep), /maximum AST depth/);
});
