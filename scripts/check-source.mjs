import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const issues = [];
let count = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.tsx?$/.test(path) || /generated\.ts$/.test(path)) continue;
    count++;
    const text = readFileSync(path, 'utf8');
    const tests = /\.test\.tsx?$/.test(path) || path.startsWith('src/test/');
    const limit = path.endsWith('.tsx') ? 250 : 200;
    if (text.split('\n').length > limit) issues.push(`${path}: exceeds ${limit} lines`);
    if (
      /from ['"](?:next|react-dom)|localStorage|sessionStorage|dangerouslySetInnerHTML/.test(text)
    )
      issues.push(`${path}: browser boundary`);
    if (!tests && /https?:\/\//.test(text))
      issues.push(`${path}: origin belongs in validated configuration`);
    if (
      !tests &&
      /console\.|@ts-ignore|eslint-disable|\bfetch\(/.test(text) &&
      !path.startsWith('src/core/transport')
    )
      issues.push(`${path}: unsafe boundary or suppressed check`);
    if (!tests && /AsyncStorage/.test(text) && !path.startsWith('src/storage/public'))
      issues.push(`${path}: public persistence belongs in public adapter`);
    if (!path.startsWith('src/ui/theme') && /#[0-9a-f]{6}\b/i.test(text))
      issues.push(`${path}: use semantic color tokens`);
  }
}
walk('src');
walk('app');
if (!count) throw new Error('No source files examined.');
if (issues.length) throw new Error(issues.join('\n'));
process.stdout.write(`Architecture/security: examined ${count} source files.\n`);
