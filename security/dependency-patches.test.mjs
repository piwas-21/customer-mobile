import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { applyRemediations, loadRemediations, verifyRemediations } from './dependency-patches.mjs';
function fixture(action) {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-patch-integrity-'));
  try {
    cpSync('security', resolve(root, 'security'), { recursive: true });
    cpSync('package-lock.json', resolve(root, 'package-lock.json'));
    for (const name of ['braces', 'node-forge'])
      cpSync(resolve('node_modules', name), resolve(root, 'node_modules', name), {
        recursive: true,
      });
    action(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('fresh original package source is required to be repaired; verify never silently prepares', () =>
  fixture((root) => {
    assert.equal(verifyRemediations(root).size, 2);
    const spec = loadRemediations(root).find((item) => item.package === 'node-forge');
    const file = spec.files[0];
    const path = resolve(root, 'node_modules/node-forge', file.path);
    let source = readFileSync(path, 'utf8');
    for (const change of [...file.replacements].reverse())
      source = source.split(change.after).join(change.before);
    writeFileSync(path, source);
    assert.throws(() => verifyRemediations(root), /Unrepaired/);
    assert.equal(applyRemediations(root).size, 2);
  }));
test('unexpected source mutation and incomplete nested-copy coverage fail closed', () =>
  fixture((root) => {
    const path = resolve(root, 'node_modules/braces/lib/compile.js');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n// unreviewed mutation\n`);
    assert.throws(() => verifyRemediations(root), /Unrepaired/);
    assert.throws(() => applyRemediations(root), /Unexpected/);
    const lockPath = resolve(root, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockPath));
    lock.packages['node_modules/other/node_modules/node-forge'] =
      lock.packages['node_modules/node-forge'];
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.throws(() => verifyRemediations(root));
  }));
