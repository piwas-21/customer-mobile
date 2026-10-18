import { GIT } from './tool-paths.mjs';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
const commonDir = realpathSync(
  execFileSync(GIT, ['rev-parse', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim(),
);
const hookDir = execFileSync(GIT, ['rev-parse', '--git-path', 'hooks'], {
  encoding: 'utf8',
}).trim();
if (basename(hookDir) !== 'hooks' || realpathSync(dirname(resolve(hookDir))) !== commonDir)
  throw new Error("Hook installation requires this repository's own Git hooks directory.");
const directory = lstatSync(hookDir, { throwIfNoEntry: false });
if (directory && !directory.isDirectory())
  throw new Error('Shared or symbolic-link hook directories cannot be replaced.');
mkdirSync(hookDir, { recursive: true });
const hooks = {
  'pre-commit': 'check-staged.mjs',
  'pre-push': 'pre-push.mjs',
  'commit-msg': 'check-message.mjs',
};
for (const name of Object.keys(hooks)) {
  const existing = lstatSync(resolve(hookDir, name), { throwIfNoEntry: false });
  if (existing && !existing.isFile() && !existing.isSymbolicLink())
    throw new Error(`Unsupported Git hook entry: ${name}`);
}
const stage = mkdtempSync(join(hookDir, '.sofra-hooks-'));
try {
  for (const [name, script] of Object.entries(hooks)) {
    const path = resolve(stage, name);
    const node = process.execPath.replaceAll("'", String.raw`'\''`);
    writeFileSync(path, `#!/bin/sh\nset -eu\nexec '${node}' scripts/${script} "$@"\n`, {
      flag: 'wx',
    });
    chmodSync(path, 0o755);
  }
  // Renaming replaces a symlink/hard link itself; writing through it would corrupt shared hooks.
  for (const name of Object.keys(hooks)) renameSync(resolve(stage, name), resolve(hookDir, name));
} finally {
  rmSync(stage, { recursive: true, force: true });
}
process.stdout.write('Installed pre-commit and fail-closed pre-push hooks.\n');
