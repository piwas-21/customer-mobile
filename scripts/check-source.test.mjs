import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const checker = resolve('scripts/check-source.mjs');
function check(source) {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-source-control-'));
  try {
    mkdirSync(resolve(root, 'src'));
    mkdirSync(resolve(root, 'app'));
    if (source !== undefined) writeFileSync(resolve(root, 'src/control.ts'), source);
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('positive control examines a valid source; empty source fails closed', () => {
  assert.equal(check('export const safe = 1;').status, 0);
  assert.notEqual(check(undefined).status, 0);
});
for (const [label, source] of Object.entries({
  'browser persistence': 'export const x = localStorage.getItem("token");',
  'unapproved network': 'export const x = fetch("/api/Orders");',
  'embedded origin': 'export const x = "https://untrusted.example";',
  'payload logging': 'console.log("customer");',
  'hardcoded colors': 'export const color = "#ffffff";',
}))
  test(`negative control rejects ${label}`, () => assert.notEqual(check(source).status, 0));

test('pre-push protected-ref guard blocks before running checks and permits feature refs to reach them', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'sofra-push-control-'));
  try {
    const fakeNpm = resolve(root, 'npm');
    writeFileSync(fakeNpm, '#!/bin/sh\nprintf QUALITY_CHECK_REACHED\nexit 7\n', { mode: 0o755 });
    const pushScript = resolve('scripts/pre-push.mjs');
    const run = (target) =>
      spawnSync(process.execPath, [pushScript], {
        encoding: 'utf8',
        input: `refs/heads/feature/control aaaa refs/heads/${target} bbbb\n`,
        env: { ...process.env, PATH: root },
      });
    const denied = run('develop');
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /Protected branches/);
    assert.doesNotMatch(denied.stdout, /QUALITY_CHECK_REACHED/);
    const feature = run('feature/control');
    assert.notEqual(feature.status, 0);
    assert.match(feature.stdout, /QUALITY_CHECK_REACHED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
