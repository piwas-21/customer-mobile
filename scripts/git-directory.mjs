import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const MAX_GIT_POINTER_BYTES = 4096;
export function gitDirectory() {
  const metadata = resolve('.git');
  const stat = lstatSync(metadata);
  if (stat.isDirectory()) return metadata;
  if (!stat.isFile() || stat.size > MAX_GIT_POINTER_BYTES) throw new Error('Invalid Git metadata');
  const pointer = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(readFileSync(metadata, 'utf8'));
  if (!pointer) throw new Error('Invalid Git worktree pointer');
  const directory = resolve(pointer[1]);
  if (!lstatSync(directory).isDirectory()) throw new Error('Git directory is unavailable');
  return directory;
}
