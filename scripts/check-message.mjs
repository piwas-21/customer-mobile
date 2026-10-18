import { readFileSync } from 'node:fs';
const message = readFileSync(process.argv[2], 'utf8').split('\n')[0];
if (
  !/^(feat|fix|refactor|chore|docs|test|perf|build|ci)(\([a-z0-9-]+\))?: .{8,100}$/.test(message)
) {
  throw new Error('Use type(scope): a clear description (8–100 characters).');
}
