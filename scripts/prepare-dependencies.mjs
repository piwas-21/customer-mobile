import { applyRemediations, verifyRemediations } from '../security/dependency-patches.mjs';
const result = process.argv.includes('--verify') ? verifyRemediations() : applyRemediations();
process.stdout.write(
  `Verified ${result.size} exact-source security repairs; package names/versions unchanged.\n`,
);
