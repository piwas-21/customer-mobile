import { accessSync, constants, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// Development/build hosts are macOS or Linux (Windows uses WSL), as do CI and EAS.
// Keep system executables independent of caller-supplied PATH entries.
export const GIT = '/usr/bin/git';
export const SHELL = '/bin/bash';
const TRUSTED_DIRECTORIES = [
  '/opt/homebrew/bin',
  dirname(process.execPath),
  '/usr/local/bin',
  '/usr/bin',
];
export const TOOL_ENV = {
  ...process.env,
  PATH: [dirname(process.execPath), ...TRUSTED_DIRECTORIES, '/bin'].join(':'),
};
export function trustedTool(name, directories = TRUSTED_DIRECTORIES) {
  if (!['npm', 'gitleaks'].includes(name)) throw new Error('Unrecognized development tool');
  for (const directory of directories) {
    const candidate = resolve(directory, name);
    try {
      const path = realpathSync(candidate);
      if (!lstatSync(path).isFile()) continue;
      accessSync(path, constants.X_OK);
      if (name === 'npm') {
        const metadata = JSON.parse(
          readFileSync(resolve(dirname(path), '../package.json'), 'utf8'),
        );
        if (metadata.name !== 'npm' || metadata.version !== '11.11.0') continue;
      }
      return path;
    } catch {
      // Try the next fixed location; caller PATH is never searched.
    }
  }
  throw new Error(`Install pinned ${name} in a trusted development tool directory`);
}
