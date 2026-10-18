import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const tests = ['scripts', 'security'].flatMap((directory) =>
  readdirSync(directory)
    .filter((file) => file.endsWith('.test.mjs'))
    .map((file) => `${directory}/${file}`),
);
for (const args of [
  ['--test', ...tests],
  ['scripts/prepare-dependencies.mjs', '--verify'],
  ['scripts/audit-dependencies.mjs'],
])
  execFileSync(process.execPath, args, { stdio: 'inherit' });
