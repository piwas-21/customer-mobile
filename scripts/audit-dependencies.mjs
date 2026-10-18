import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { verifyRemediations } from '../security/dependency-patches.mjs';
import { assessAudit } from '../security/audit-report.mjs';
const verified = verifyRemediations();
// Repaired behavior is required in addition to hashes. This never executes an unpatched library.
execFileSync(process.execPath, ['--test', 'security/dependency-exploits.test.mjs'], {
  stdio: 'inherit',
});
const raw = spawnSync('npm', ['audit', '--json', '--audit-level=high'], {
  encoding: 'utf8',
  maxBuffer: 8_000_000,
  timeout: 45_000,
});
if (raw.error || raw.signal) throw new Error('npm audit could not execute');
mkdirSync('.local', { recursive: true });
writeFileSync('.local/npm-audit.raw.json', raw.stdout);
const result = assessAudit(JSON.parse(raw.stdout), raw.status, verified);
writeFileSync('.local/npm-audit.assessment.json', JSON.stringify(result, null, 2));
process.stdout.write(
  `${JSON.stringify(result)}\nAll high/critical advisory roots are source-repaired and behavior-verified. Registry metadata remains visible.\n`,
);
