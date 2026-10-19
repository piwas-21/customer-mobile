import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { customerSubset } from './contract-subset.mjs';
const [sourcePath, backendCommit, frontendCommit, captured, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !sourcePath ||
  !/^[a-f0-9]{40}$/.test(backendCommit ?? '') ||
  !/^[a-f0-9]{40}$/.test(frontendCommit ?? '') ||
  !/^\d{4}-\d{2}-\d{2}$/.test(captured ?? '') ||
  new Date(captured).toISOString().slice(0, 10) !== captured
)
  throw new Error(
    'Usage: capture-contracts.mjs <local OpenAPI JSON> <verified backend SHA> <verified frontend SHA> <YYYY-MM-DD>',
  );
const bytes = readFileSync(sourcePath);
const document = JSON.parse(bytes);
const operations = JSON.parse(readFileSync('contracts/customer-operations.json', 'utf8'));
const subset = customerSubset(document, operations);
const previous = JSON.parse(readFileSync('contracts/baseline.json', 'utf8'));
const baseline = {
  captured,
  backendCommit,
  frontendCommit,
  source: previous.source,
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  sourcePaths: Object.keys(document.paths).length,
  sourceSchemas: Object.keys(document.components?.schemas ?? {}).length,
  paths: Object.keys(subset.paths).length,
  schemas: Object.keys(subset.components.schemas ?? {}).length,
  note: 'Client subset is not an authorization boundary. Current deployed handlers remain authoritative.',
};
writeFileSync('contracts/customer.openapi.json', JSON.stringify(subset, null, 2) + '\n');
writeFileSync('contracts/baseline.json', JSON.stringify(baseline, null, 2) + '\n');
process.stdout.write(
  `Captured ${baseline.paths} customer paths and ${baseline.schemas} reachable schemas.\n`,
);
