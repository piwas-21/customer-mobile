import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { GIT } from './tool-paths.mjs';
const checker = resolve('scripts/check-message.mjs');
test('commit-message checks reject arbitrary CLI paths and symlinks; support real worktree pointers', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-message-control-'));
  try {
    const metadata = resolve(root, '.git');
    mkdirSync(metadata);
    const expected = resolve(metadata, 'COMMIT_EDITMSG');
    const outside = resolve(root, 'outside');
    writeFileSync(expected, 'feat(scope): valid staged description\n');
    writeFileSync(outside, 'feat(scope): valid outside description\n');
    const run = (path) =>
      spawnSync(process.execPath, [checker, ...(path ? [path] : [])], {
        cwd: root,
        encoding: 'utf8',
      });
    const valid = run(expected);
    assert.equal(valid.status, 0, valid.stderr);
    assert.notEqual(run(outside).status, 0);
    assert.notEqual(run().status, 0);
    rmSync(expected);
    symlinkSync(outside, expected);
    assert.notEqual(run(expected).status, 0);
    rmSync(metadata, { recursive: true });
    const worktree = resolve(root, 'actual-git');
    mkdirSync(worktree);
    const worktreeMessage = resolve(worktree, 'COMMIT_EDITMSG');
    writeFileSync(metadata, 'gitdir: actual-git\n');
    writeFileSync(worktreeMessage, 'fix(scope): valid worktree description\n');
    const validWorktree = run(worktreeMessage);
    assert.equal(validWorktree.status, 0, validWorktree.stderr);
    writeFileSync(worktreeMessage, 'unstructured message\n');
    assert.notEqual(run(worktreeMessage).status, 0);
    writeFileSync(metadata, 'unrecognized pointer\n');
    assert.notEqual(run(worktreeMessage).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Git non-fast-forward merge validates its real MERGE_MSG hook input', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-merge-message-'));
  const fixtureEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const git = (...args) => {
    const result = spawnSync(GIT, args, { cwd: root, encoding: 'utf8', env: fixtureEnv });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '--initial-branch=develop');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@invalid.example');
    writeFileSync(resolve(root, 'base'), 'base');
    git('add', 'base');
    git('commit', '-m', 'chore(test): establish fixture base');
    git('switch', '-c', 'feature');
    writeFileSync(resolve(root, 'feature'), 'feature');
    git('add', 'feature');
    git('commit', '-m', 'chore(test): add fixture feature');
    git('switch', 'develop');
    writeFileSync(resolve(root, 'develop'), 'develop');
    git('add', 'develop');
    git('commit', '-m', 'chore(test): advance fixture develop');
    const hook = resolve(root, '.git/hooks/commit-msg');
    writeFileSync(hook, `#!/bin/sh\nexec '${process.execPath}' '${checker}' "$1"\n`, {
      mode: 0o755,
    });
    git('merge', '--no-ff', 'feature', '-m', 'chore(test): merge fixture feature');
    assert.equal(git('show', '-s', '--format=%P').split(' ').length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
