import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TEMPLATE_PATH = '.local/native-template.tgz';
export const MAX_TEMPLATE_BYTES = 1_000_000;
export function verifyTemplate(bytes, config) {
  const digest = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (bytes.length === 0 || bytes.length > MAX_TEMPLATE_BYTES || digest !== config.integrity)
    throw new Error('Native template integrity or size mismatch');
}
export function templateUrl(config, pkg) {
  if (
    !/^\d+\.\d+\.\d+$/.test(config.version) ||
    config.version.split('.')[0] !== config.expo.split('.')[0] ||
    pkg.dependencies.expo !== config.expo ||
    pkg.dependencies.react !== config.react ||
    pkg.dependencies['react-native'] !== config.reactNative
  )
    throw new Error('Native template does not match pinned runtime dependencies');
  return `https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-${config.version}.tgz`;
}
export async function prepareNativeTemplate({ root = process.cwd(), fetcher = fetch } = {}) {
  const config = JSON.parse(await readFile(resolve(root, 'native-template.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const url = templateUrl(config, pkg);
  const target = resolve(root, TEMPLATE_PATH);
  try {
    verifyTemplate(await readFile(target), config);
    return target;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error('Native template download failed');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_TEMPLATE_BYTES) throw new Error('Native template download exceeds size limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  verifyTemplate(bytes, config);
  await mkdir(resolve(root, '.local'), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return target;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await prepareNativeTemplate();
  process.stdout.write('Verified pinned native template.\n');
}
