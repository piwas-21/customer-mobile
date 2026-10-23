import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import configPlugins from '@expo/config-plugins';

const { AndroidConfig } = configPlugins;

export async function verifyNativeLinks(path, host) {
  assert.ok(typeof host === 'string' && host.length > 0, 'Expected fixture host is required');
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(path);
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const activities = [...(application.activity ?? []), ...(application['activity-alias'] ?? [])];
  const filters = activities
    .flatMap((activity) => activity['intent-filter'] ?? [])
    .filter(
      (filter) =>
        filter.$?.['android:autoVerify'] === 'true' ||
        (filter.data ?? []).some((data) => ['http', 'https'].includes(data.$?.['android:scheme'])),
    );
  assert.equal(filters.length, 1, 'Expected exactly one public HTTPS intent filter');
  const filter = filters[0];
  assert.equal(filter.$?.['android:autoVerify'], 'true');
  assert.deepEqual(
    filter.action?.map((value) => value.$['android:name']),
    ['android.intent.action.VIEW'],
  );
  assert.deepEqual(
    new Set(filter.category?.map((value) => value.$['android:name'])),
    new Set(['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE']),
  );
  const data = filter.data ?? [];
  const rows = new Map(data.map((value) => [value.$['android:pathPattern'], value.$]));
  const expected = [
    '/r/.*/payment-return/.*',
    '/r/.*/table-payment-return/.*',
    '/r/.*/verify',
    '/r/.*/recover',
  ];
  assert.equal(data.length, expected.length);
  assert.equal(rows.size, expected.length);
  for (const pattern of expected)
    assert.deepEqual(rows.get(pattern), {
      'android:scheme': 'https',
      'android:host': host,
      'android:pathPattern': pattern,
    });
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  await verifyNativeLinks(process.argv[2], process.argv[3]);
  process.stdout.write(
    'Verified four scoped native HTTPS intent paths. Signing remains separate.\n',
  );
}
