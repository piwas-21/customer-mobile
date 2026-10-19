import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getConfig } from '@expo/config';
import {
  MAX_TEMPLATE_BYTES,
  prepareNativeTemplate,
  TEMPLATE_PATH,
  templateUrl,
  verifyTemplate,
} from './native-template.mjs';

const bytes = Buffer.from('independent reviewed native template fixture');
const config = {
  version: '56.0.37',
  expo: '56.0.23',
  react: '19.2.3',
  reactNative: '0.85.3',
  integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
};
const pkg = {
  dependencies: { expo: config.expo, react: config.react, 'react-native': config.reactNative },
};
async function fixture(run) {
  const root = await mkdtemp(resolve(tmpdir(), 'sofra-native-template-'));
  try {
    await writeFile(resolve(root, 'native-template.json'), JSON.stringify(config));
    await writeFile(resolve(root, 'package.json'), JSON.stringify(pkg));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('template provenance matches exact SDK/runtime pins and rejects version or URL injection', () => {
  assert.equal(
    templateUrl(config, pkg),
    'https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-56.0.37.tgz',
  );
  for (const changed of [
    { ...config, version: '57.0.1' },
    { ...config, version: '../other' },
    { ...config, expo: '56.0.24' },
    { ...config, react: '19.3.0' },
    { ...config, reactNative: '0.86.0' },
  ])
    assert.throws(() => templateUrl(changed, pkg), /pinned/);
});
test('integrity guard distinguishes exact bytes from empty, oversized and altered templates', () => {
  assert.doesNotThrow(() => verifyTemplate(bytes, config));
  for (const altered of [
    Buffer.alloc(0),
    Buffer.alloc(MAX_TEMPLATE_BYTES + 1),
    Buffer.from('changed'),
  ])
    assert.throws(() => verifyTemplate(altered, config), /integrity or size/);
});
test('downloads only the pinned registry artifact, verifies before atomic installation and reuses valid cache', async () =>
  fixture(async (root) => {
    let calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      assert.equal(
        url,
        'https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-56.0.37.tgz',
      );
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 5));
            controller.enqueue(bytes.subarray(5));
            controller.close();
          },
        }),
      );
    };
    const target = await prepareNativeTemplate({ root, fetcher });
    assert.equal(target, resolve(root, TEMPLATE_PATH));
    assert.deepEqual(await readFile(target), bytes);
    assert.deepEqual(await readdir(resolve(root, '.local')), ['native-template.tgz']);
    assert.equal(await prepareNativeTemplate({ root, fetcher }), target);
    assert.equal(calls, 1);
  }));
test('corrupt cache blocks without downloading or overwriting it', async () =>
  fixture(async (root) => {
    await mkdir(resolve(root, '.local'));
    const target = resolve(root, TEMPLATE_PATH);
    await writeFile(target, 'unreviewed');
    await assert.rejects(
      prepareNativeTemplate({
        root,
        fetcher: async () => {
          throw new Error('network must not run');
        },
      }),
      /integrity/,
    );
    assert.equal(await readFile(target, 'utf8'), 'unreviewed');
  }));
test('failed, empty, altered and oversized network bodies install no artifact', async () => {
  for (const response of [
    new Response('failure', { status: 503 }),
    new Response(null),
    new Response(''),
    new Response('altered'),
    new Response(Buffer.alloc(MAX_TEMPLATE_BYTES + 1)),
  ])
    await fixture(async (root) => {
      await assert.rejects(
        prepareNativeTemplate({ root, fetcher: async () => response }),
        /download|integrity/,
      );
      await assert.rejects(readFile(resolve(root, TEMPLATE_PATH)), { code: 'ENOENT' });
    });
});
test('network failures and filesystem errors remain failures', async () =>
  fixture(async (root) => {
    await assert.rejects(
      prepareNativeTemplate({
        root,
        fetcher: async () => {
          throw new Error('offline');
        },
      }),
      /offline/,
    );
    await writeFile(resolve(root, '.local'), 'file blocks cache directory');
    await assert.rejects(prepareNativeTemplate({ root }), { code: 'ENOTDIR' });
  }));
test('CLI succeeds only with a verified artifact and emits affirmative evidence', async () =>
  fixture(async (root) => {
    await mkdir(resolve(root, '.local'));
    await writeFile(resolve(root, TEMPLATE_PATH), bytes);
    const command = resolve('scripts/native-template.mjs');
    const good = spawnSync(process.execPath, [command], { cwd: root, encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /Verified pinned native template/);
    await writeFile(resolve(root, TEMPLATE_PATH), 'bad');
    const bad = spawnSync(process.execPath, [command], { cwd: root, encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.doesNotMatch(bad.stdout, /Verified pinned/);
  }));
test('local, CI and EAS generation all use the verified artifact before native tooling', async () => {
  const app = JSON.parse(await readFile('package.json', 'utf8'));
  const eas = JSON.parse(await readFile('eas.json', 'utf8'));
  assert.equal(eas.build.base.prebuildCommand, 'prebuild --template .local/native-template.tgz');
  assert.equal(app.scripts['native:prepare'], 'node scripts/native-template.mjs');
  assert.equal(
    app.scripts['native:generate'],
    'npm run native:prepare && expo prebuild --no-install --template .local/native-template.tgz',
  );
  for (const platform of ['ios', 'android']) {
    assert.equal(
      app.scripts[platform],
      `npm run native:generate -- --platform ${platform} && expo run:${platform}`,
    );
    const workflow = await readFile(`.eas/build/${platform}.yml`, 'utf8');
    assert.ok(workflow.indexOf('verified_dependencies') < workflow.indexOf('eas/prebuild'));
  }
  assert.match(await readFile('.eas/build/dependencies.yml', 'utf8'), /npm run native:prepare/);
  assert.match(await readFile('.github/workflows/ci.yml', 'utf8'), /run: npm run native:generate/);
  assert.match(await readFile('scripts/pre-push.mjs', 'utf8'), /\['run', 'native:generate'\]/);
});
test('customer native configuration blocks microphone, media-storage and overlay access', () => {
  const { exp } = getConfig(process.cwd());
  const blocked = exp.android.blockedPermissions;
  for (const permission of [
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ])
    assert.ok(blocked.includes(permission), `${permission} must be removed from merged manifests`);
  assert.ok(!blocked.includes('android.permission.CAMERA'));
  assert.equal(exp.android.allowBackup, false);
  assert.equal(exp.updates.enabled, false);
  assert.ok(exp.plugins.includes('expo-system-ui'));
  const camera = exp.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera');
  const secure = exp.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store',
  );
  assert.equal(camera[1].microphonePermission, false);
  assert.equal(camera[1].recordAudioAndroid, false);
  assert.equal(secure[1].faceIDPermission, false);
});
