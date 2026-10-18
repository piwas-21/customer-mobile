import { GIT } from './tool-paths.mjs';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const hookDir = execFileSync(GIT, ['rev-parse', '--git-path', 'hooks'], {
  encoding: 'utf8',
}).trim();
mkdirSync(hookDir, { recursive: true });
for (const [name, script] of Object.entries({
  'pre-commit': 'check-staged.mjs',
  'pre-push': 'pre-push.mjs',
  'commit-msg': 'check-message.mjs',
})) {
  const path = resolve(hookDir, name);
  const node = process.execPath.replaceAll("'", String.raw`'\''`);
  writeFileSync(path, `#!/bin/sh\nset -eu\nexec '${node}' scripts/${script} "$@"\n`);
  chmodSync(path, 0o755);
}
process.stdout.write('Installed pre-commit and fail-closed pre-push hooks.\n');
