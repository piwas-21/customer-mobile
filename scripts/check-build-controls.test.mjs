import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { GIT } from './tool-paths.mjs';
const bundleCheck = resolve('scripts/check-bundle.mjs');
const hookInstaller = resolve('scripts/install-hooks.mjs');
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);
test('bundle budget requires both bundles and rejects an oversized native artifact', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-bundle-'));
  try {
    mkdirSync(resolve(root, 'dist/ios'), { recursive: true });
    const run = () => spawnSync(process.execPath, [bundleCheck], { cwd: root, encoding: 'utf8' });
    writeFileSync(resolve(root, 'dist/ios/main.hbc'), 'fixture');
    assert.notEqual(run().status, 0);
    const android = resolve(root, 'dist/android.js');
    writeFileSync(android, 'fixture');
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    const report = JSON.parse(readFileSync(resolve(root, 'dist/bundle-budget.json'), 'utf8'));
    assert.equal(report.maxBytes, 8_000_000);
    assert.equal(report.bundles.length, 2);
    truncateSync(android, 8_000_001);
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('hook installation uses the current Node binary and preserves worktree common hooks', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-hooks-'));
  const git = (...args) => {
    const result = spawnSync(GIT, args, { cwd: root, encoding: 'utf8', env: fixtureEnv });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git('init', '--initial-branch=feature/test');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture');
    git('commit', '--allow-empty', '-m', 'chore(test): establish fixture base');
    const worktree = resolve(root, 'worktree');
    git('worktree', 'add', '-b', 'feature/other', worktree);
    const result = spawnSync(process.execPath, [hookInstaller], {
      cwd: worktree,
      encoding: 'utf8',
      env: fixtureEnv,
    });
    assert.equal(result.status, 0, result.stderr);
    for (const [name, script] of Object.entries({
      'pre-commit': 'check-staged.mjs',
      'pre-push': 'pre-push.mjs',
      'commit-msg': 'check-message.mjs',
    })) {
      const hook = readFileSync(resolve(root, '.git/hooks', name), 'utf8');
      assert.ok(hook.includes(process.execPath));
      assert.ok(hook.includes(`scripts/${script}`));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
