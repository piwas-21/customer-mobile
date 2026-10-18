import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const refUpdates = readFileSync(0, 'utf8').trim().split('\n').filter(Boolean);
for (const line of refUpdates) {
  const fields = line.split(/\s+/);
  if (fields.length !== 4) throw new Error('Malformed Git ref update; push blocked.');
  if (['refs/heads/main', 'refs/heads/develop'].includes(fields[2])) {
    throw new Error('Protected branches are updated only by reviewed GitHub PRs.');
  }
}
for (const args of [
  ['run', 'check'],
  ['audit', '--audit-level=high'],
  ['run', 'build'],
]) {
  execFileSync('npm', args, { stdio: 'inherit' });
}
const workspace = process.env.RUMI_WORKSPACE_ROOT || resolve('..');
const reviewer = resolve(workspace, 'scripts/review-gate/run-review.sh');
if (!existsSync(reviewer))
  throw new Error('Workspace reviewer missing; push blocked. Configure RUMI_WORKSPACE_ROOT.');
execFileSync(
  'bash',
  [
    reviewer,
    '--mode=pre-push',
    '--repo=customer-mobile',
    `--repo-dir=${process.cwd()}`,
    '--diff-source=branch',
  ],
  { stdio: 'inherit' },
);
