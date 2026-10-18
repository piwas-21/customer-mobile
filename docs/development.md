# Development workflow

Use Node from .nvmrc and npm 11.11.0. Run npm ci --ignore-scripts then npm run hooks:install. Install Gitleaks 8.30.1 for local staged secret scans.
Pinned direct versions and package-lock.json define the dependency graph. Expo SDK 56 is the
initial compatibility baseline (React Native 0.85.3 / React 19.2.3); upgrades are explicit PRs.
SDK reference: https://docs.expo.dev/versions/v56.0.0/.

## Working loop

1. Read acceptance criteria and backend handler/DTO evidence. Write an independent fixture.
2. Choose the smallest journey slice; document any changed API/authorization boundary.
3. Implement a pure rule, service/hook and thin native route. Reuse shared components and tokens.
4. Run targeted tests then npm run check and npm run build. Fix findings before committing.
5. Commit using explicit paths. Pre-commit checks the staged snapshot, not an unrelated dirty tree.
6. Pre-push reruns checks and the workspace AI reviewer, failing closed if it is unavailable.
7. Open a develop PR with acceptance evidence. CI gates are mandatory. Use workspace merge gate.

## Enforced checks

Pre-commit rejects protected branches, conflicts, secret-file extensions and oversized staged
files; runs quality checks against an isolated copy of the index. npm run check covers formatting,
strict types, ESLint (hooks/a11y), source boundaries, unit/component coverage, security regression
fixtures and duplicate source blocks. Pre-push refuses direct protected-branch updates, then runs dependency audit and both native bundle exports.
CI repeats these in a clean checkout and uploads coverage/bundle manifests. No lifecycle scripts
run during dependency installation. Native plugins are exercised by development builds.

## Design and performance

Restaurant content leads: readable menu rows, clear prices, persistent basket access, explicit
restaurant switching. Menu / Orders / Account are primary navigation. Quantity comes first;
required choices explain the remaining count; intermediate steps say Next, final step Add to basket.
Use semantic tokens with measured AA contrast, visible focus on web previews, text scaling and RTL.
Avoid unbounded lists, nested virtual lists, per-row network calls and speculative write retries.
Public caches are dated and size bounded; private data never enters AsyncStorage or query persistence.
Record cached-menu <2s and cold-menu <3s on named physical devices/network separately from bundle size.

## Security and review

Threat model: malicious QR/redirect, tenant switch races, forged directory, stolen capability,
logout races, unknown settlement and replayed submit. Negative tests must demonstrate each boundary.
Do not trust a tenant ID in a token or link as authorization. Validate on server too.
No analytics, Sentry or Expo Push activation until processors, consent and scrubbing are approved.
No secrets in EAS public variables. Store/publisher credentials are external configuration.
