import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/check-export-root.mjs');
function fixture(root) {
  mkdirSync(join(root, 'node_modules/expo-router'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'node_modules/expo-router/entry.js'), '');
}
for (const mode of ['local', 'dependency-link', 'router-link', 'entry-link', 'missing'])
  test(`native export root ${mode}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'native-export-root-'));
    try {
      const project = join(root, 'project');
      const sibling = join(root, 'sibling');
      fixture(project);
      fixture(sibling);
      if (mode === 'dependency-link') {
        rmSync(join(project, 'node_modules'), { recursive: true });
        symlinkSync(join(sibling, 'node_modules'), join(project, 'node_modules'));
      } else if (mode === 'router-link') {
        rmSync(join(project, 'node_modules/expo-router'), { recursive: true });
        symlinkSync(
          join(sibling, 'node_modules/expo-router'),
          join(project, 'node_modules/expo-router'),
        );
      } else if (mode === 'entry-link') {
        rmSync(join(project, 'node_modules/expo-router/entry.js'));
        symlinkSync(
          join(sibling, 'node_modules/expo-router/entry.js'),
          join(project, 'node_modules/expo-router/entry.js'),
        );
      } else if (mode === 'missing') rmSync(join(project, 'node_modules'), { recursive: true });
      const result = spawnSync(process.execPath, [script], { cwd: project, encoding: 'utf8' });
      if (mode === 'local') {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /entry resolves inside this checkout/);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /own node_modules|another checkout|entry escaped|ENOENT/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
