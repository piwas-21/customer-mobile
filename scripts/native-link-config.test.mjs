import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const configUrl = pathToFileURL(resolve('app.config.ts')).href;
function run(origin, environment = 'staging') {
  const env = { ...process.env, EXPO_PUBLIC_ENVIRONMENT: environment };
  if (origin === undefined) delete env.EXPO_PUBLIC_MOBILE_LINK_ORIGIN;
  else env.EXPO_PUBLIC_MOBILE_LINK_ORIGIN = origin;
  return spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--input-type=module',
      '-e',
      `const { default: config } = await import(${JSON.stringify(configUrl)}); process.stdout.write(JSON.stringify(config));`,
    ],
    { encoding: 'utf8', env },
  );
}
for (const environment of ['staging', 'production'])
  test(`native ${environment} links use only the explicit approved central origin`, () => {
    const result = run('https://links.example', environment);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.deepEqual(config.ios.associatedDomains, ['applinks:links.example']);
    assert.deepEqual(config.android.intentFilters, [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'links.example', pathPattern: '/r/.*/payment-return/.*' },
          { scheme: 'https', host: 'links.example', pathPattern: '/r/.*/verify' },
          { scheme: 'https', host: 'links.example', pathPattern: '/r/.*/recover' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ]);
    assert.equal(config.ios.bundleIdentifier, config.android.package);
    assert.equal(config.updates.enabled, false);
  });
test('unconfigured origin declares no OS association', () => {
  const result = run(undefined);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.deepEqual(config.ios.associatedDomains, []);
  assert.deepEqual(config.android.intentFilters, []);
});
for (const origin of [
  '',
  'http://links.example',
  'https://user@links.example',
  'https://links.example/path',
  'https://links.example/',
  'https://links.example:8443',
  'https://links.example?operation=borrowed',
])
  test(`invalid native link origin refuses build: ${origin}`, () => {
    const result = run(origin);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /canonical HTTPS origin|Invalid URL/);
  });
