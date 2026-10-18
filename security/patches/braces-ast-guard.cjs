"use strict";

// Reviewed bounded traversal for GHSA-vfj7-8cjw-p6xm. Never follow parent/prev links.
const MAX_DEPTH = 64;
const MAX_NODES = 20001;
const assertDepth = (depth) => {
  if (depth > MAX_DEPTH) throw new SyntaxError("braces: maximum AST depth exceeded");
};
const validateAst = (ast) => {
  const pending = [[ast, 0]];
  const seen = new WeakSet();
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    assertDepth(depth);
    if (!node || typeof node !== "object") throw new TypeError("braces: invalid AST node");
    if (seen.has(node)) throw new SyntaxError("braces: cyclic or reused AST node");
    seen.add(node);
    if (++count > MAX_NODES) throw new SyntaxError("braces: maximum AST size exceeded");
    if (node.nodes !== undefined) {
      if (!Array.isArray(node.nodes)) throw new TypeError("braces: invalid AST children");
      for (let index = node.nodes.length - 1; index >= 0; index--) {
        pending.push([node.nodes[index], depth + 1]);
      }
    }
  }
};
module.exports = { assertDepth, validateAst };
