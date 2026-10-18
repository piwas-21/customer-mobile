import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { trustedTool } from './tool-paths.mjs';

test('tool lookup ignores attacker PATH and requires exact npm package identity/version', () => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'sofra-tool-path-')));
  const originalPath = process.env.PATH;
  try {
    const bin = resolve(root, 'bin');
    const npmRoot = resolve(root, 'npm');
    mkdirSync(bin);
    mkdirSync(resolve(npmRoot, 'bin'), { recursive: true });
    const cli = resolve(npmRoot, 'bin/npm-cli.js');
    writeFileSync(cli, '// controlled fixture', { mode: 0o755 });
    symlinkSync(cli, resolve(bin, 'npm'));
    const metadata = resolve(npmRoot, 'package.json');
    writeFileSync(metadata, JSON.stringify({ name: 'npm', version: '10.0.0' }));
    assert.throws(() => trustedTool('npm', [bin]), /Install pinned/);
    writeFileSync(metadata, JSON.stringify({ name: 'imposter', version: '11.11.0' }));
    assert.throws(() => trustedTool('npm', [bin]), /Install pinned/);
    writeFileSync(metadata, JSON.stringify({ name: 'npm', version: '11.11.0' }));
    assert.equal(trustedTool('npm', [bin]), cli);
    chmodSync(cli, 0o644);
    assert.throws(() => trustedTool('npm', [bin]), /Install pinned/);
    process.env.PATH = bin;
    assert.notEqual(trustedTool('npm'), cli);
    assert.throws(() => trustedTool('../npm', [bin]), /Unrecognized/);
    mkdirSync(resolve(bin, 'gitleaks'));
    assert.throws(() => trustedTool('gitleaks', [bin]), /Install pinned/);
    rmSync(resolve(bin, 'gitleaks'), { recursive: true });
    writeFileSync(resolve(bin, 'gitleaks'), '// fixture', { mode: 0o755 });
    assert.equal(trustedTool('gitleaks', [bin]), resolve(bin, 'gitleaks'));
  } finally {
    process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});
