import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const capture = resolve('scripts/capture-contracts.mjs');
const backend = 'a'.repeat(40);
const frontend = 'b'.repeat(40);
test('local capture records exact input bytes and verified revision arguments with bounded selection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sofra-contract-capture-'));
  try {
    mkdirSync(join(directory, 'contracts'));
    const source = JSON.stringify({
      openapi: '3.0.4',
      paths: {
        '/api/menu': { get: { responses: { 200: { description: 'OK' } } } },
        '/api/admin': { get: { responses: { 200: { description: 'Private' } } } },
      },
      components: { schemas: { Private: { type: 'string' } } },
    });
    writeFileSync(join(directory, 'source.json'), source);
    writeFileSync(
      join(directory, 'contracts/customer-operations.json'),
      JSON.stringify({ '/api/menu': ['get'] }),
    );
    writeFileSync(
      join(directory, 'contracts/baseline.json'),
      JSON.stringify({ source: 'https://approved.example/openapi.json' }),
    );
    const run = (...args) =>
      spawnSync(process.execPath, [capture, ...args], { cwd: directory, encoding: 'utf8' });
    const result = run('source.json', backend, frontend, '2026-10-19');
    assert.equal(result.status, 0, result.stderr);
    const baselinePath = join(directory, 'contracts/baseline.json');
    const baselineBytes = readFileSync(baselinePath, 'utf8');
    const baseline = JSON.parse(baselineBytes);
    assert.deepEqual(baseline, {
      captured: '2026-10-19',
      backendCommit: backend,
      frontendCommit: frontend,
      source: 'https://approved.example/openapi.json',
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      sourcePaths: 2,
      sourceSchemas: 1,
      paths: 1,
      schemas: 0,
      note: 'Client subset is not an authorization boundary. Current deployed handlers remain authoritative.',
    });
    const subsetPath = join(directory, 'contracts/customer.openapi.json');
    const subsetBytes = readFileSync(subsetPath, 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(subsetBytes).paths), ['/api/menu']);
    for (const args of [
      [],
      ['source.json', 'bad', frontend, '2026-10-19'],
      ['source.json', backend, 'bad', '2026-10-19'],
      ['source.json', backend, frontend, 'bad'],
      ['source.json', backend, frontend, '2026-02-31'],
      ['source.json', backend, frontend, '2026-10-19', 'extra'],
    ]) {
      assert.notEqual(run(...args).status, 0);
      assert.equal(readFileSync(baselinePath, 'utf8'), baselineBytes);
      assert.equal(readFileSync(subsetPath, 'utf8'), subsetBytes);
    }
    assert.equal(run('source.json', backend, frontend, '2026-10-19').status, 0);
    assert.equal(readFileSync(subsetPath, 'utf8'), subsetBytes);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
