import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { gitDirectory } from './git-directory.mjs';
const MAX_MESSAGE_BYTES = 64 * 1024;
const directory = realpathSync(gitDirectory());
const supplied = process.argv[2];
const expected = ['COMMIT_EDITMSG', 'MERGE_MSG']
  .map((name) => resolve(directory, name))
  .find((path) => supplied && path === resolve(supplied));
if (!expected) throw new Error('Only this repository Git commit message may be checked.');
const metadata = lstatSync(expected);
if (!metadata.isFile() || metadata.size > MAX_MESSAGE_BYTES)
  throw new Error('Commit message must be a bounded regular file.');
const message = readFileSync(expected, 'utf8').split('\n')[0];
if (!/^(feat|fix|refactor|chore|docs|test|perf|build|ci)(\([a-z0-9-]+\))?: .{8,100}$/.test(message))
  throw new Error('Use type(scope): a clear description (8–100 characters).');
