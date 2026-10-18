import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const issues = [];
let count = 0;
function sourceIssues(path, text) {
  const tests = /\.test\.tsx?$/.test(path) || path.startsWith('src/test/');
  const limit = path.endsWith('.tsx') ? 250 : 200;
  const checks = [
    [text.split('\n').length > limit, `exceeds ${limit} lines`],
    [
      /from ['"](?:next|react-dom)|localStorage|sessionStorage|dangerouslySetInnerHTML/.test(text),
      'browser boundary',
    ],
    [!tests && /https?:\/\//.test(text), 'origin belongs in validated configuration'],
    [
      !tests &&
        /console\.|@ts-ignore|eslint-disable|\bfetch\(/.test(text) &&
        !path.startsWith('src/core/transport'),
      'unsafe boundary or suppressed check',
    ],
    [
      !tests && /AsyncStorage/.test(text) && !path.startsWith('src/storage/public'),
      'public persistence belongs in public adapter',
    ],
    [!path.startsWith('src/ui/theme') && /#[0-9a-f]{6}\b/i.test(text), 'use semantic color tokens'],
  ];
  return checks.filter(([failed]) => failed).map(([, reason]) => `${path}: ${reason}`);
}
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    const source = path.endsWith('.ts') || path.endsWith('.tsx');
    if (!source || path === 'src/api/generated.ts') continue;
    count++;
    issues.push(...sourceIssues(path, readFileSync(path, 'utf8')));
  }
}
walk('src');
walk('app');
if (!count) throw new Error('No source files examined.');
if (issues.length) throw new Error(issues.join('\n'));
process.stdout.write(`Architecture/security: examined ${count} source files.\n`);
