import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const bundles = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:js|hbc)$/.test(path)) bundles.push({ path, bytes: statSync(path).size });
  }
}
walk('dist');
if (bundles.length < 2) throw new Error('Both native platform bundles must exist.');
const maxBytes = 8_000_000;
if (bundles.some((bundle) => bundle.bytes > maxBytes))
  throw new Error('Native bundle exceeds 8 MB review budget.');
writeFileSync('dist/bundle-budget.json', JSON.stringify({ maxBytes, bundles }, null, 2));
process.stdout.write(
  `${bundles.length} native bundles within ${maxBytes} bytes each. Device startup remains unverified.\n`,
);
