import { GIT, SHELL, trustedTool, TOOL_ENV } from './tool-paths.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function prePush(input, resolveNpm = () => trustedTool('npm')) {
  for (const line of input.trim().split('\n').filter(Boolean)) {
    const fields = line.split(/\s+/);
    if (fields.length !== 4) throw new Error('Malformed Git ref update; push blocked.');
    if (['refs/heads/main', 'refs/heads/develop'].includes(fields[2])) {
      throw new Error('Protected branches are updated only by reviewed GitHub PRs.');
    }
  }
  const npm = resolveNpm();
  execFileSync(process.execPath, [npm, 'run', 'contracts:generate'], {
    stdio: 'inherit',
    env: TOOL_ENV,
  });
  execFileSync(GIT, ['diff', '--exit-code', 'HEAD', '--', 'src/api/generated.ts'], {
    stdio: 'inherit',
    env: TOOL_ENV,
  });
  for (const args of [
    ['run', 'check'],
    ['run', 'audit:security'],
    ['run', 'build'],
  ]) {
    execFileSync(process.execPath, [npm, ...args], { stdio: 'inherit', env: TOOL_ENV });
  }
  const workspace = process.env.RUMI_WORKSPACE_ROOT || resolve('..');
  const reviewer = resolve(workspace, 'scripts/review-gate/run-review.sh');
  if (!existsSync(reviewer))
    throw new Error('Workspace reviewer missing; push blocked. Configure RUMI_WORKSPACE_ROOT.');
  execFileSync(
    SHELL,
    [
      reviewer,
      '--mode=pre-push',
      '--repo=customer-mobile',
      `--repo-dir=${process.cwd()}`,
      '--diff-source=branch',
    ],
    { stdio: 'inherit', env: TOOL_ENV },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  prePush(readFileSync(0, 'utf8'));
