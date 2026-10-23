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

Account entry requires an enabled Reservations capability from the current bootstrap observer and
an active customer. Private pages and details are ephemeral, scoped to tenant/environment/principal/
controller revision and modal
instance. Logout, context/capability/zone withdrawal and failed refresh hide data; dismissal removes
the query cache. A withdrawn modal requires a new explicit open action after capability returns.

These handwritten adapters target the additive backend source contract. They do not alter the
captured deployed OpenAPI fixture. Backend acceptance, deployed tenant availability, signed device
checks, all supported locales/RTL and installed accessibility remain release gates. Availability,
creation uses the separate durable contract below. Owned edits and cancellation remain open.

## Native reservation availability

The Bookings tab follows the current Reservations bootstrap gate. Public availability uses the
additive schema1 backend projection and never installs customer or guest credentials. The adapter
binds date, party size and restaurant timezone to the original request, validates a maximum 48
unique ordered wall-time slots, and rejects table/contact/staff fields. Availability reserves nothing;
creation must later revalidate and accept a durable booking operation.

Date selection uses SDK 56's pinned `@react-native-community/datetimepicker` 9.1.0. Calendar values use
an explicit UTC marker and `timeZoneName="UTC"` on both platforms; restaurant today is derived on the
restaurant clock. Party 1–20 bounds are shared with the wire schema. Native iOS confirmation and
Android selection/dismissal preserve the selected calendar day. The package's Android component
closes its native picker on unmount; an additional component lifetime guard ignores late native
selection/dismissal callbacks. Context/capability/timezone withdrawal removes the whole view.

Results live only in component memory and are scoped to tenant/environment/generation, client,
restaurant zone, calendar day, party and lifecycle revision. Input changes or failed refresh hide
old results. Newer requests and lifecycle changes suppress late replies. Foreground requires a fresh
explicit check and recomputes the restaurant day, including an overnight resume with no earlier result.

The package is SDK-pinned and MIT licensed ([upstream](https://github.com/react-native-datetimepicker/datetimepicker)).
Native generation, both exports, dependency audit and installed iOS/Android date-picker, accessibility,
large text and RTL checks remain independent gates. Source/JavaScript export does not prove a rebuilt
native client or device behavior. Full localization, owned changes and installed creation acceptance remain open.

## Native loyalty reads

The Account points entry uses the native versioned owner-only balance and bounded ledger contract.
Recorded totals are not spendability or money quotes; checkout recalculates current available points
and discounts. Strict adapters reject extra private fields, unsupported kinds, malformed bounds,
duplicate/unordered movements and cursor regression while preserving the exact UTC sort marker.
Staff notes, audit data and order references are excluded.

Balance and ledger queries are separate ephemeral reads with no cross-query snapshot claim. The
shared Customer module entry also serves reservation history. Account/controller revision, tenant,
capability, timezone and currency changes withdraw the modal; failed refresh hides retained data.
Closing removes both private queries. Ledger rows are virtualized, points are localized and event
timestamps use the restaurant timezone. English fallback is available; full locale/RTL review,
backend acceptance/deployment, installed accessibility and redemption/discount journeys remain open.

## Durable reservation creation

`CustomerReservationController` owns the native `/api/customer-mobile/reservations/create` family.
Preparation sends the full contact draft but creates no booking. The server returns an operation,
tenant, payload hash and protected owner proof. `ReservationOperationRepository` serializes on the
installation SessionRepository queue and acknowledges contact storage before the separate proof.
Only then may transport dispatch the exact saved full input, original session and optional customer JWT.
The queue never spans network I/O. A rejected customer token never becomes a guest request.

`/recover` and `/cancel-attempt` use only the original minimal proof. Unseen is observation, never a
release. The captured cancellation operation ID must equal the persisted original before any mutation or purge. The durable cancellation flag is acknowledged before contact purge and cannot permit later full-body retry. Applied/Cancelled decisions are acknowledged before cleanup; dismissal requires the
same terminal operation and verified removals. Logout keeps proof and purges private contact. Runtime
transport refuses unbound routes, bodies, owner revisions and cross-tenant/session changes.

`ReservationProvider` supplies one shared scoped actor to Bookings and Orders. Query holds only its
non-secret attempt view; private drafts live in the form and temporary scoped SecureStore contact
record. Backgrounding, changed selection, capability/account/tenant withdrawal and unmount discard
unsubmitted contact. Foreground restores local recovery state without automatically sending a write.
Fresh public form configuration uses the shared customer-field policy and native input options.

The additive contract has strict handwritten adapters; the captured deployed OpenAPI stays unchanged
until deployment. No booking change/cancellation, notification delivery or server migration deployment
is implied by source acceptance. Full locale/RTL and installed native acceptance remain required.

Authenticated original recovery uses `CustomerRecoveryReads`, shared with order receipt/payment/
cancellation reads. Its owner-bound one-renewal path permits only exact persisted reservation proof
and current stored refresh credentials, including during account-disabled/read-only recovery. New
creation never enters this path. Rejected refresh retains the shared customer reminder before cleanup,
preserving minimal proof and requiring same-customer reauthentication or explicit separate-customer
continuation. The reminder appears in Bookings as well as Orders and Account.

Original reservation recovery preserves both the booking resource lifetime and the account owner guard through private header reads, token renewal, secure credential activation and retry. A withdrawn resource cannot dispatch a later recover/stop request or install a late renewal. App-state events dispose the current actor before queued React updates; layout cleanup withdraws committed account/bootstrap/tenant scope changes synchronously.

## Owned reservation cancellation

The dedicated `/api/customer-mobile/reservations/cancellation` family shares the durable attempt
queue and mandatory Orders recovery surface. Customer-only preparation is read-only. A volatile
candidate contains the protected server response; the detail modal shows its fresh customer
snapshot before explicit destructive confirmation. Candidate operation IDs, owner/controller and
target lifetime are checked before installation. No proof or review snapshot enters Query/router
state. A stale confirmation cannot submit or discard a newer candidate.

Confirmed cancellation persists minimal proof/session plus booking ID/zone metadata in acknowledged
SecureStore, without contact input. Only the explicitly confirmed candidate submits once. Persisted cancellation attempts are recovery/stop-only,
including across restart; they never offer another submit. A known
HTTP409 records a diagnostic when secure storage permits; a failed diagnostic save keeps the current
refusal visible and cannot enable retry. After restart without that diagnostic, the original remains
uncertain and recovery-only. Check/stop remain available before a fresh review.
Unseen never releases it. Stopping an unseen attempt does not cancel the booking; Applied records
this cancellation's completion rather than the booking's later staff-controlled status. Detail is
refreshed separately. The existing native modal contains review and recovery confirmations.

New submit never renews or automatically replays. Original recover/stop alone may renew once after
module withdrawal. Rejected renewal preserves the original-customer reminder and minimal authority
through cleanup/restart and requires reauthentication or explicit separate-customer continuation.
Backend contract acceptance, deployment, all ten locales/RTL and installed native verification remain
required; this local implementation cannot activate a tenant or create a production booking.

## Checkout points selection

A ready Customer basket with enabled loyalty can request a whole number of points while entering
checkout details. A recorded balance is never treated as a spendable or monetary guarantee. The
existing native checkout quote confirms eligible points, customer discounts and totals. Review shows
requested and applied points separately; the original requested number and exact quote fingerprint
continue into the durable order intent even when the server applies fewer points. Confirmation still
uses the existing one-operation order journal and recovery path.

The points field is volatile and clears with checkout details. Guests and unavailable capabilities
cannot select points. Withdrawal hides an outstanding quote, including after re-enablement; a fresh
explicit review is required. An entered request must be explicitly removed before zero-point review
when loyalty becomes unavailable. No new provider, settlement, schema or production activation is
introduced. Full locale/RTL, deployment and installed acceptance remain required.

## Owned reservation editor contracts

Private editor contact and assigned-arrangement availability use separate strict adapters bound to
the requested customer, restaurant, booking, zone, date and party. Existing contact remains editable;
these reads never grant write authority or enter the deployed OpenAPI capture. Preparation binds the
original and proposed minimal bookings to the exact request and preserves the server approval rule.
The connected editor replaces reservation detail and its date picker replaces the editor. Private contact
stays in component memory and a separate acknowledged SecureStore intent; it never enters routing,
Query state or the minimal recovery record. Existing optional phone/requests remain visible and preserved
when the current form hides them. Explicit review shows original/proposed dates, time, party, status,
requests and the exact proposed contact before confirmation.

Owned edits and cancellations share one volatile candidate lifetime. Confirmation consumes that exact
candidate before saving; one initial edit submission uses original full input and proof. Uncertain and
Unseen results retain the original operation and allow only checking/stopping, including after restart.
The original Customer proof can renew once during module/account withdrawal; initial submission never
renews or retries. Known Applied results refresh the exact owned detail and history. Native exports,
independent exact review, backend publication/deployment, full locales/RTL and installed acceptance remain gates.

## Native table visit adapter and custody

The existing guest visit join and account contracts have strict native adapters. Joining sends only
the exact QR value anonymously after explicit action. Account reads send only the exact persisted
participant capability to its service-session account route; Customer JWT and basket session never
substitute for that capability. The separate existing table mode retains its two-credential semantics
for later round work. Capability, flag, lifecycle, tenant, owner, expiry and response identity are
checked independently.

Participant authority is an acknowledged, versioned SecureStore record partitioned by environment,
restaurant and original account/guest owner. The shared installation queue refuses implicit visit
replacement and corrupt/foreign state; explicit local leaving checks the exact visit and deletion
readback. Logout clears this private access with acknowledged deletion. Expiry does not infer a new
visit or erase existing evidence. No participant token enters an ordinary persistence or query key.

The account projection preserves original versus payable totals and billing credit, separate
remaining/credit amounts, frozen line totals, legacy daily identities and unknown future status text.
Database bigint revisions must be exact safe integers; nested items stop at the server's twenty-level
projection boundary. This adapter/storage slice does not expose admission UI, rounds, payments,
notifications or deployed/installed acceptance. Those journeys and full locale/RTL remain required.

## Native table admission and bill

The camera accepts trusted central restaurant table references and existing printed `/scan?qr=…`
links only at one unambiguous registered restaurant web origin. Missing/duplicate/extra query data,
foreign origins, withdrawn or expired directory entries are refused. It never fetches the scanned
URL. Both forms hand QR authority to a single
volatile, two-minute slot. Only a change counter is observable; QR bytes never enter navigation,
Query, persistent storage or logs. A new capture, invalid capture, tenant mismatch or expiry withdraws
the prior slot. The Table screen requires a fresh explicit Join confirmation and current module,
flag, lifecycle and tenant compatibility before its single anonymous admission request.

The returned participant capability and exact service-session identity are acknowledged in
SecureStore under the original environment, tenant and Customer or basket-guest owner. Admission
has no automatic retry. A lost response requires a new physical scan/review; a completed secure save
can be restored without joining again. Existing access is never silently replaced. Local leaving
requires confirmation, exact session identity and acknowledged deletion; it does not settle or
close the restaurant bill. Logout cleanup shares the repository queue and verifies deletion.

Bill reads send only the original participant header to the exact saved session path, with fresh
capability checks and no Customer JWT, basket header or token renewal. Original Customer access can
be restored when accounts are disabled without enabling another join. Resource disposal and
owner/tenant/configuration/app-state changes withdraw private callbacks; failed refresh hides the
previous bill while retaining original participant custody. A shared private-controller lifetime
also preserves reservation restoration and synchronous AppState withdrawal.
An owner/visit-scoped deadline cancels account reads and removes private bill data when participant
access expires, including while the screen stays foreground. The original secure record remains
available for explicit local leaving. Clock-controlled tests distinguish the final valid millisecond
from the expired display and verify that expiry creates no request.

Server original/payable amounts, adjustments, paid/remaining/credit and frozen item totals are
shown independently. A nullable legacy currency never becomes an invented amount. Exact safe
integer account revisions, legacy daily-number/date values, customer-only nested item projection
and duplicate/order identity binding are checked. The native view is virtualized and refuses more
than 5,000 rows instead of silently omitting charges; this does not bound server queries or payloads.

Source coverage includes existing printed-code origin/query controls, rendered admission/local leaving, failed refresh, same-owner revision,
background/tenant/capability withdrawal, private handoff, secure-store acknowledgement and original
header binding. English fallback is present. General verified OS table links, the printed-QR/web
installation bridge, rounds and table payments, ten locales/RTL, physical SecureStore/camera/accessibility,
deployment and installed multi-tenant acceptance remain separate required work.

## Original native table rounds

The Dine-in basket reviews a fresh owned basket and current participant-only table account, then
shows the bounded server-priced shared composition before explicit confirmation. The original
no-contact intent and purpose-bound proof are acknowledged in environment/tenant/principal-scoped
SecureStore before one initial submit. Review authority is volatile and consumed before installation.
No submit retry or new operation is exposed after uncertainty; Check and confirmed Stop use only the
original proof, session and Customer/guest owner. Canonical Applied/Cancelled decisions are saved
before acknowledged dismissal; Unseen retains the hold. The shared storage queue arbitrates basket,
checkout, cancellation, table admission and round claims. Local leaving cannot erase round recovery.

The root round provider restores only minimal local state. Orders, Basket and Table show pending
recovery independently of current table capability. Original customer recover/stop may renew once
with the same private owner/resource lifetime after participant/current-session removal. New
submission never automatically renews. Logout removes credentials and participant authority while
retaining the original round proof and an explicit Customer reminder, including withdrawn-tenant
cleanup. Review and pending state exclude raw proof/participant from navigation and Query caches.
Fresh configuration, owner revision, SecureStore readback and synchronous AppState withdrawal fence
late work. Shared bill, basket and history reads refresh after original operations; a displayed bill
cannot release an unresolved operation. Backend #761 must be accepted on develop before dependent
mobile source publication; deployed/installed acceptance remains separate. No tenant activation,
real round, payment, notification or deployment is performed.

## Current native translation resources

The native runtime in `src/i18n.ts` currently registers only English resources, with English
fallback for other device languages. Its translation modules are the existing `*.en.ts` files;
there are no other native locale bundles to keep in parity in this source slice. New contribution
labels use that same i18next boundary. This is incomplete release localization: the plan still
requires all ten locales, RTL and installed accessibility acceptance before release. No translated
bundle, supported-language restriction or localization acceptance is implied here.

## Native table payment account reads

The table's explicit Payment details view reads backend #762's schema1 current participant account.
Its private scope captures the original visit, canonical local session, owner, tenant/environment and
currency. Customer JWTs remain additional to the participant grant; missing credentials never fall
back or automatically renew. The transport binds the exact GET path, current saved participant and
original session before sending. Current module flags, expiry and resource lifetime fence reads;
the modal requires the same displayed bill revision/currency and withdraws failed or late results.
Closing the modal withdraws its guard even while the root table controller stays alive. Returned
account data stays in local modal state and never enters Query or persistent storage.

A diner who only ordered through staff can have no native basket session. The shared secure queue
acknowledges a local correlation UUID without creating a basket or replacing an existing session.
An interrupted basket installation prevents a new UUID so its original recovery remains intact.
The response reports server-held and unreserved amounts and optional server share positions; none
of these grant payment authority. Known two-decimal currencies mirror CheckoutAmount's allow-list;
BigInt formatting preserves even the largest safe minor-unit integer without floating-point cents.
English fallback is present. Backend source must be accepted before dependent mobile publication.

Strict native contracts cover all five contribution modes, original submit/recover/stop and separate
checkout decisions. Items responses bind the exact selected order/item/ordinal set; reserved and
Unseen decisions never imply payment. The deployed OpenAPI capture remains unchanged.

Original intent/proof and minimal reviewed money are acknowledged in scoped SecureStore. The shared
purchase queue refuses replacement after lost acknowledgement, malformed custody or an unresolved
contribution. Cancellation intent survives late replies; canonical paid/stopped evidence is required
before acknowledged dismissal. URLs and participant credentials never enter this record. Logout and
account-disabled restore preserve original private recovery custody and a Customer reminder.

The separate strict transport now binds native contribution prepare/submit/recover/stop and original
hosted start/recover/stop to exact routes, immutable request bodies and acknowledged private records.
New requests require separate live participant and original session authority. Original minimal
recovery and stopping survive local leaving or read-only withdrawal; Customer recovery may renew
once using only its original proof and stored credentials. Initial submission never renews or retries.
Owner/resource/tenant withdrawal fences paused headers, responses, renewal installation and retries.

The connected table contribution flow reviews Full, Amount, Items and existing Equal/CustomAmount
share positions before acknowledged private custody and one submission. Fixed share slices follow
reviewed scope order and exact minor-unit rounding; equal-price replacement allocations are refused.
Canonical Ready opens only an approved current provider URL. Browser results and return links never
mark Paid; foreground recovery uses original private proof. Unknown outcomes retain the purchase
hold and require explicit original checking/stopping. Account, basket, orders and table screens share
minimal recovery notices. Read-only preparation stays volatile and is withdrawn on dismissal.

Table payment returns have a separate public attempt route and exact HTTPS intent scope. They
navigate to the table and never reuse order identity or carry settlement/token authority. No new
split-plan creation, runtime activation, live provider payment, signing or deployment is performed.
Full locales/RTL, installed browser/storage lifecycle, accepted backend/transport publication,
new split plans and provider/device acceptance remain required.

## Native split-plan source contracts

The separate schema1 plan intent, read-only preparation and minimal original resolution contracts
bind tenant, public operation, visit, revision, exact frozen allocation and ordered per-guest amounts.
Equal and custom contribution selection share the same exact BigInt distribution check with new
plan review. CHF/EUR equal shares retain the five-minor increment and final remainder; supported
other currencies use stable one-minor remainder positions. Custom amounts retain original order.
A preparation never authorizes payment or creates a plan. These contracts do not connect plan
creation, custody, transport or UI. Original-proof server integration, durable local recovery and
backend-ordered publication precede the connected journey; source does not activate any tenant.

Schema1 split-plan resolution mirrors the accepted backend `CustomerTablePlanResolutionDto`: only
operation, service-session, outcome and optional plan identity are returned. The purpose-bound
original proof and scoped transport enforce tenant/environment/principal authority; the pure
resolution decoder binds the returned operation and service session. Requiring a new echoed tenant
field would contradict the accepted server contract and reject valid original recovery responses.
