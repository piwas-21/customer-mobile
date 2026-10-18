import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const push = resolve('scripts/pre-push.mjs');
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);
test('a staged uncommitted generated correction cannot validate stale pushed HEAD', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-contract-push-'));
  try {
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, env: fixtureEnv, stdio: 'pipe' });
    git('init', '--quiet', '--initial-branch=feature/control');
    git('config', 'user.name', 'T');
    git('config', 'user.email', 'test');
    mkdirSync(resolve(root, 'src/api'), { recursive: true });
    mkdirSync(resolve(root, 'bin'));
    writeFileSync(
      resolve(root, 'bin/npm'),
      `#!/bin/sh
if [ "$*" = 'run contracts:generate' ]; then printf 'correct\\n' > src/api/generated.ts; exit 0; fi
printf QUALITY_CHECK_REACHED
exit 7
`,
      { mode: 0o755 },
    );
    const file = 'src/api/generated.ts';
    writeFileSync(resolve(root, file), 'stale\n');
    git('add', '--', file);
    git('commit', '--quiet', '-m', 'initial', '--', file);
    writeFileSync(resolve(root, file), 'correct\n');
    git('add', '--', file);
    const run = () =>
      spawnSync(process.execPath, [push], {
        cwd: root,
        encoding: 'utf8',
        env: { ...fixtureEnv, PATH: `${resolve(root, 'bin')}:${fixtureEnv.PATH}` },
        input: 'refs/heads/feature/control aaaa refs/heads/feature/control bbbb\n',
      });
    const stale = run();
    assert.notEqual(stale.status, 0);
    assert.doesNotMatch(stale.stdout, /QUALITY_CHECK_REACHED/);
    git('commit', '--quiet', '-m', 'generated correction', '--', file);
    const current = run();
    assert.notEqual(current.status, 0);
    assert.match(current.stdout, /QUALITY_CHECK_REACHED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
