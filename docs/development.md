# Development workflow

Development/build hooks run on macOS or Linux; Windows developers use WSL.
System Git and Bash use fixed OS paths. npm and Gitleaks resolve only from Homebrew,
the active Node installation, /usr/local/bin or /usr/bin; caller PATH is ignored.
The npm CLI must identify as npm 11.11.0 and runs with the current Node binary.
Installed Git hooks also pin that Node binary; reinstall them after changing runtimes.
The installer stages hook files and atomically replaces this repository's own entries. Existing
symlinks/hard links are replaced locally so shared workspace hook targets stay unchanged. Shared
hook directories and external core.hooksPath configurations are refused before installation.

Use Node from .nvmrc and npm 11.11.0. Run npm ci --ignore-scripts, npm run dependencies:prepare, then npm run hooks:install. Install Gitleaks 8.30.1 for local staged secret scans.
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
fixtures and duplicate source blocks. Native coverage includes the runtime screens, APIs and storage;
separate V8 coverage includes workflow/security scripts and their subprocesses. Both reports
feed Sonar. Native and tooling gates require at least 85% lines/statements/functions and 80% branches.
The tooling suite runs the full dependency audit, so network access is required. Pre-push refuses direct protected-branch updates, then runs dependency audit and both native bundle exports.
CI repeats these in a clean checkout. No lifecycle scripts
run during dependency installation. EAS custom builds run the explicit install, source repair, verification and audit steps before
prebuild, CocoaPods or Gradle. Native plugins are exercised by development builds.
Build ordering follows https://docs.expo.dev/custom-builds/schema/.

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

## Exact-source dependency repairs

Registry metadata has no patched release for two high advisory roots. Reviewed source repairs are
specified in security/remediations.json without changing dependency names or versions. Preparation
checks exact original hashes before applying patches; ordinary checks require exact repaired hashes.
The security suite proves the original defects, patched rejection and independent valid controls.
The audit gate always runs npm audit over the full dependency graph, retains the raw report and
resolves wrapper findings to advisory roots. Only roots repaired in every installed copy with matching
lockfile/version/source/behavior evidence can be marked source-remediated. New findings, unknown
sources, missing copies, audit process/report errors and stale patches block. Registry-clean and
source-remediated are separate evidence states; neither can be claimed from a filtered audit count.
