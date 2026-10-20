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
The tooling suite runs the full dependency audit, so network access is required. Pre-push refuses direct protected-branch updates, then runs dependency audit, verified native generation and both native bundle exports.
Native export first verifies that node_modules, Expo Router and its entry resolve inside the current
checkout. Dependency symlinks into sibling checkouts are refused: Expo can otherwise export the
sibling's app while source tests pass locally. Install this checkout's pinned dependencies before
exporting; the guard has independent real-directory and cross-checkout symlink controls.
CI repeats these in a clean checkout. No lifecycle scripts
run during dependency installation. EAS custom builds run the explicit install, source repair, verification and audit steps before
prebuild, CocoaPods or Gradle. Native plugins are exercised by development builds.

Native generation uses the reviewed SDK-matching template in native-template.json. The pinned
Expo package currently embeds a template for a different SDK; accepting that default produced
runtime mismatch warnings. npm run native:prepare downloads only the exact npm registry archive,
verifies SHA-512 before atomic installation and refuses a corrupted cache. npm run native:generate
uses that artifact for both platforms without installing pods or signing. CI repeats generation;
local Android/iOS commands and the EAS base prebuildCommand use the same artifact. Runtime upgrades
must update and verify this template alongside Expo/React/React Native. expo-system-ui supplies the
Android appearance plugin. Generated native projects are build evidence; successful compiler,
signing and installed-device checks are separate gates.
Template selection and the EAS override follow https://docs.expo.dev/workflow/continuous-native-generation/
and https://docs.expo.dev/eas/json/.
Build ordering follows https://docs.expo.dev/custom-builds/schema/.

## Design and performance

Restaurant content leads: readable menu rows, clear prices, persistent basket access, explicit
restaurant switching. Menu / Orders / Account are primary navigation. Quantity comes first;
required choices explain the remaining count; intermediate steps say Next, final step Add to basket.
Receipt reorder fetches current product and side details outside the ordinary fresh public cache.
Only historical quantity and kitchen notes seed the current guided choices; current basket writes and
checkout quotes remain authoritative for price/availability. Reorder query keys retain the original
restaurant/principal/revision and expire on dismissal. Never replay a historical recipe or amount.
Use semantic tokens with measured AA contrast, visible focus on web previews, text scaling and RTL.
Avoid unbounded lists, nested virtual lists, per-row network calls and speculative write retries.
Public caches are dated and size bounded; private data never enters AsyncStorage or query persistence.
Record cached-menu <2s and cold-menu <3s on named physical devices/network separately from bundle size.

## Security and review

Threat model: malicious QR/redirect, tenant switch races, forged directory, stolen capability,
logout races, unknown settlement and replayed submit.
A rejected refresh withdraws credentials while retaining a tenant-scoped unresolved-purchase
reminder. Guest ownership stays unavailable across restart and cleanup retries. Same-owner sign-in
restores access; a separately confirmed shared-device transition dismisses only the local reminder,
never the original financial proof or server reconciliation. Negative tests must demonstrate each boundary.
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

## Refreshing deployed customer contracts

Read the served backend and frontend versions independently before capturing the full backend OpenAPI
JSON over verified HTTPS. Keep the capture local and record the complete source revisions. Review
`contracts/customer-operations.json` explicitly: it selects methods as well as paths, so a shared
customer/admin route cannot silently import a new staff operation. The subset is not authorization.

Run `node scripts/capture-contracts.mjs <local-json> <backend-sha> <frontend-sha> <YYYY-MM-DD>`, then
`npm run contracts:generate`. Capture records the exact source byte hash, full inventory counts and
reachable customer schemas. It rejects missing operations, unresolved/external references and
unsupported document versions. Review generated diffs against deployed handlers; a source-only
endpoint must not enter the deployed snapshot. Commit the allowlist, baseline, subset and generated
types together. Existing CI checks generation drift without accessing a live service.

## Native reservation read foundation

The additive schemaVersion1 `/api/customer-mobile/reservations` history/detail adapters use the
original Customer session authority and refuse mismatched detail identities. History retains exact
UTC/TimeSpan/ID cursor strings, including database fractional precision and legacy non-midnight
values. Displayed booking days remain calendar dates; wall times are not converted through a device
or restaurant offset. Unknown statuses and legacy non-wall-clock durations have explicit fallbacks.

Account entry requires fresh enabled Reservations capability and an active customer. Private pages
and details are ephemeral, scoped to tenant/environment/principal/controller revision and modal
instance. Logout, context/capability/zone withdrawal and failed refresh hide data; dismissal removes
the query cache. A withdrawn modal requires a new explicit open action after capability returns.

These handwritten adapters target the additive backend source contract. They do not alter the
captured deployed OpenAPI fixture. Backend acceptance, deployed tenant availability, signed device
checks, all supported locales/RTL and installed accessibility remain release gates. Availability,
creation, edits and cancellation are separate reservation implementation; this source adds reads.
