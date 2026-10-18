import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
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
    const hostileMarker = resolve(root, 'hostile-node-executed');
    writeFileSync(
      resolve(root, 'bin/node'),
      '#!/bin/sh\nprintf hostile > "$CONTROL_HOSTILE_NODE"\nexit 81\n',
      { mode: 0o755 },
    );
    writeFileSync(
      resolve(root, 'bin/npm.mjs'),
      `import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const node = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' });
if (node.status !== 0 || node.stdout.trim() !== process.execPath) process.exit(9);
const args = process.argv.slice(2).join(' ');
appendFileSync(process.env.CONTROL_CAPTURE, args + '\\n');
if (readFileSync('package-lock.json', 'utf8') !== 'staged-lock' || readFileSync('package.json', 'utf8') !== 'staged-package') process.exit(8);
if (args === 'ci --ignore-scripts' && process.env.CONTROL_FAIL === 'install') process.exit(1);
if (args === 'run dependencies:prepare' && process.env.CONTROL_FAIL === 'prepare') process.exit(1);
if (args === 'run check') process.stdout.write('CHECK_REACHED');
`,
      { mode: 0o755 },
    );
    const launcher = resolve(root, 'run.mjs');
    writeFileSync(
      launcher,
      `import { checkStaged } from ${JSON.stringify('file://' + checker)}; checkStaged(process.argv[2], process.argv[3]);`,
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
      const result = spawnSync(
        process.execPath,
        [launcher, resolve(root, 'bin/npm.mjs'), resolve(root, 'bin/gitleaks')],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...fixtureEnv,
            PATH: `${resolve(root, 'bin')}:${process.env.PATH}`,
            CONTROL_CAPTURE: capture,
            CONTROL_HOSTILE_NODE: hostileMarker,
            CONTROL_FAIL: fail,
          },
        },
      );
      assert.equal(existsSync(hostileMarker), false, 'Caller PATH node must never execute');
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
