import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
// Expo Router locates app routes relative to its resolved dependency tree. A dependency
// symlink into another checkout can export that checkout while our source tests pass.
const root = realpathSync(process.cwd());
const localDependencies = join(root, 'node_modules');
if (realpathSync(localDependencies) !== localDependencies)
  throw new Error('Native export requires this checkout’s own node_modules directory.');
const router = join(localDependencies, 'expo-router');
if (realpathSync(router) !== router)
  throw new Error('Native export cannot resolve Expo Router through another checkout.');
const entry = realpathSync(createRequire(join(root, 'package.json')).resolve('expo-router/entry'));
if (!entry.startsWith(router + '/'))
  throw new Error('Native export entry escaped this checkout’s Expo Router.');
process.stdout.write('Native export entry resolves inside this checkout’s dependency directory.\n');
