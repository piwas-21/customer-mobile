import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (['main', 'develop', 'HEAD'].includes(git('symbolic-ref', '--short', 'HEAD'))) {
  throw new Error('Commit from a feature/fix/chore/docs branch. Protected branches are PR-only.');
}
execFileSync('git', ['diff', '--cached', '--check'], { stdio: 'inherit' });
const patch = execFileSync('git', ['diff', '--cached', '--no-ext-diff'], { maxBuffer: 8_000_000 });
execFileSync('gitleaks', ['stdin', '--redact', '--no-banner'], {
  input: patch,
  stdio: ['pipe', 'inherit', 'inherit'],
});
const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACM')
  .split('\n')
  .filter(Boolean);
if (!staged.length) throw new Error('No staged changes to validate.');
for (const file of staged) {
  if (
    /(?:^|\/)(?:\.env(?!\.example$)|app-secrets)|\.(?:pem|key|pfx|p12|p8|jks|keystore|mobileprovision)$/.test(
      file,
    )
  ) {
    throw new Error(`Sensitive file staged: ${file}`);
  }
  const size = Number(git('cat-file', '-s', `:${file}`));
  if (size > 2_000_000) throw new Error(`Staged file exceeds 2 MB: ${file}`);
}
const snapshot = mkdtempSync(resolve(tmpdir(), 'sofra-index-'));
try {
  execFileSync('git', ['checkout-index', '--all', `--prefix=${snapshot}${sep}`]);
  execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: snapshot, stdio: 'inherit' });
  execFileSync('npm', ['run', 'dependencies:prepare'], { cwd: snapshot, stdio: 'inherit' });
  execFileSync('npm', ['run', 'check'], { cwd: snapshot, stdio: 'inherit' });
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
