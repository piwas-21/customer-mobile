import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { GIT } from './tool-paths.mjs';
const installer = resolve('scripts/install-hooks.mjs');
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);
function withRepository(run) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'sofra-hook-links-')));
  const git = (...args) => {
    const result = spawnSync(GIT, args, { cwd: root, encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git('init', '--initial-branch=feature/test');
    run({
      root,
      git,
      hooks: resolve(root, '.git/hooks'),
      install: () => spawnSync(process.execPath, [installer], { cwd: root, encoding: 'utf8', env }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
for (const link of ['symlink', 'hardlink']) {
  test(`installation replaces each ${link} locally without changing the shared target`, () => {
    withRepository(({ root, hooks, install }) => {
      const names = ['pre-commit', 'pre-push', 'commit-msg'];
      for (const name of names) {
        const shared = resolve(root, `shared-${name}`);
        writeFileSync(shared, `review gate ${name}`, { mode: 0o600 });
        const destination = resolve(hooks, name);
        if (link === 'symlink') symlinkSync(shared, destination);
        else linkSync(shared, destination);
      }
      const result = install();
      assert.equal(result.status, 0, result.stderr);
      for (const name of names) {
        const destination = resolve(hooks, name);
        assert.equal(lstatSync(destination).isSymbolicLink(), false);
        assert.ok(readFileSync(destination, 'utf8').includes(process.execPath));
        assert.equal(statSync(destination).mode & 0o777, 0o755);
        assert.equal(readFileSync(resolve(root, `shared-${name}`), 'utf8'), `review gate ${name}`);
        assert.equal(statSync(resolve(root, `shared-${name}`)).mode & 0o777, 0o600);
      }
      assert.equal(
        readdirSync(hooks).some((name) => name.startsWith('.sofra-hooks-')),
        false,
      );
    });
  });
}
test('refuses a symlinked hooks directory without touching any shared entry', () => {
  withRepository(({ root, hooks, install }) => {
    const shared = resolve(root, 'shared-hooks');
    renameSync(hooks, shared);
    writeFileSync(resolve(shared, 'pre-push'), 'shared review gate');
    symlinkSync(shared, hooks, 'dir');
    const before = readdirSync(shared);
    const result = install();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symbolic-link hook directories/);
    assert.equal(lstatSync(hooks).isSymbolicLink(), true);
    assert.deepEqual(readdirSync(shared), before);
    assert.equal(readFileSync(resolve(shared, 'pre-push'), 'utf8'), 'shared review gate');
  });
});
test('refuses external core.hooksPath configuration before any installation', () => {
  withRepository(({ root, git, hooks, install }) => {
    const shared = resolve(root, 'external/hooks');
    mkdirSync(shared, { recursive: true });
    writeFileSync(resolve(shared, 'pre-push'), 'configured review gate');
    git('config', 'core.hooksPath', shared);
    const before = readdirSync(hooks);
    const result = install();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /own Git hooks directory/);
    assert.deepEqual(readdirSync(hooks), before);
    assert.deepEqual(readdirSync(shared), ['pre-push']);
    assert.equal(readFileSync(resolve(shared, 'pre-push'), 'utf8'), 'configured review gate');
  });
});
test('preflights unsupported hook entries before replacing an earlier valid hook', () => {
  withRepository(({ hooks, install }) => {
    writeFileSync(resolve(hooks, 'pre-commit'), 'existing staged gate');
    mkdirSync(resolve(hooks, 'pre-push'));
    const result = install();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported Git hook entry/);
    assert.equal(readFileSync(resolve(hooks, 'pre-commit'), 'utf8'), 'existing staged gate');
    assert.equal(lstatSync(resolve(hooks, 'pre-push')).isDirectory(), true);
  });
});
