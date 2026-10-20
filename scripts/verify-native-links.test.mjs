import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyNativeLinks } from './verify-native-links.mjs';
const paths = ['/r/.*/payment-return/.*', '/r/.*/verify', '/r/.*/recover'];
function fixture() {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:name=".MainApplication"><activity android:name=".MainActivity"><intent-filter android:autoVerify="true"><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/>${paths.map((path) => `<data android:scheme="https" android:host="links.example" android:pathPattern="${path}"/>`).join('')}</intent-filter></activity></application></manifest>`;
}
async function withManifest(xml, action) {
  const directory = await mkdtemp(join(tmpdir(), 'sofra-link-manifest-'));
  try {
    const path = join(directory, 'AndroidManifest.xml');
    await writeFile(path, xml);
    await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test('accepts an independent exact native manifest and CLI verification', async () => {
  await withManifest(fixture(), async (path) => {
    await verifyNativeLinks(path, 'links.example');
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/verify-native-links.mjs'), path, 'links.example'],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Verified three scoped/);
  });
});
for (const [name, change] of [
  [
    'missing verify',
    (xml) => xml.replace('android:pathPattern="/r/.*/verify"', 'android:pathPattern="/unrelated"'),
  ],
  [
    'missing recover',
    (xml) => xml.replace('android:pathPattern="/r/.*/recover"', 'android:pathPattern="/unrelated"'),
  ],
  ['wildcard path', (xml) => xml.replace('/r/.*/verify', '/.*')],
  ['foreign host', (xml) => xml.replace('links.example', 'foreign.example')],
  ['insecure scheme', (xml) => xml.replace('android:scheme="https"', 'android:scheme="http"')],
  ['unverified filter', (xml) => xml.replace('autoVerify="true"', 'autoVerify="false"')],
  [
    'no HTTPS filters',
    () =>
      '<manifest><application android:name=".MainApplication"><activity/></application></manifest>',
  ],
  ['empty filter data', (xml) => xml.replace(/<data[^>]*\/>/g, '')],
  ['missing categories', (xml) => xml.replace(/<category[^>]*\/>/g, '')],
  ['malformed XML', () => 'invalid XML'],
])
  test(`rejects ${name} instead of accepting a broad or absent association`, async () => {
    await withManifest(change(fixture()), (path) =>
      assert.rejects(verifyNativeLinks(path, 'links.example')),
    );
  });
test('CLI refuses an absent expected host', async () => {
  const result = spawnSync(process.execPath, [resolve('scripts/verify-native-links.mjs')], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected fixture host is required/);
});
