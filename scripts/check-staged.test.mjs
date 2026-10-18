import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const checker = resolve('scripts/check-staged.mjs');
// Git hooks export index/worktree variables; disposable test repositories must not inherit them.
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);
test('staged validation installs the staged lock and stops before checks when install/prepare fails', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-staged-control-'));
  try {
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, stdio: 'pipe', env: fixtureEnv });
    git('init', '--initial-branch=feature/control');
    mkdirSync(resolve(root, 'bin'));
    writeFileSync(resolve(root, 'bin/gitleaks'), '#!/bin/sh\ncat >/dev/null\n', { mode: 0o755 });
    const capture = resolve(root, 'commands');
    writeFileSync(
      resolve(root, 'bin/npm'),
      `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$CONTROL_CAPTURE"
[ "$(cat package-lock.json)" = 'staged-lock' ]
[ "$(cat package.json)" = 'staged-package' ]
case "$*" in
  'ci --ignore-scripts') [ "$CONTROL_FAIL" != install ] ;;
  'run dependencies:prepare') [ "$CONTROL_FAIL" != prepare ] ;;
  'run check') printf CHECK_REACHED ;;
  *) exit 8 ;;
esac
`,
      { mode: 0o755 },
    );
    for (const [name, content] of [
      ['package-lock.json', 'staged-lock'],
      ['package.json', 'staged-package'],
    ]) {
      writeFileSync(resolve(root, name), content);
      git('add', '--', name);
      writeFileSync(resolve(root, name), 'dirty-working-copy');
    }
    for (const fail of ['', 'install', 'prepare']) {
      writeFileSync(capture, '');
      const result = spawnSync(process.execPath, [checker], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...fixtureEnv,
          PATH: `${resolve(root, 'bin')}:${process.env.PATH}`,
          CONTROL_CAPTURE: capture,
          CONTROL_FAIL: fail,
        },
      });
      if (!fail) {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /CHECK_REACHED/);
        assert.equal(
          readFileSync(capture, 'utf8'),
          'ci --ignore-scripts\nrun dependencies:prepare\nrun check\n',
        );
      } else {
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout, /CHECK_REACHED/);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
