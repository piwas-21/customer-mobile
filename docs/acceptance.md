# Customer acceptance gates

Implementation follows ../docs/plans/CUSTOMER-MOBILE-APPS-PLAN.md in the workspace.
Source tests, deployment, native compiler output, signing and physical acceptance are separate evidence.
Never enable tenants from fixture data or send production orders, payments or notifications for a test.

| Phase | Current source                                                                                             | Remaining acceptance                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P0    | Company repository, pinned runtime, customer-only contracts, hooks/CI/review/Sonar                         | Two approved pilot tenants, company publisher accounts and EAS ownership                    |
| P1    | Menu, guided standalone/bundle choices, owned basket state/read/add/recovery, QR and switching foundations | Hosted payment return, notification tap and physical iPhone/Android journeys                |
| P2    | Trusted directory/bootstrap, context cancellation, scoped storage/transport and native generation          | Shared host deployment, verified links, full localization/RTL, signed reproducible builds   |
| P3    | Email accounts, profile editing, durable basket operation contract and native ordering controls            | Social/verification/reset links, addresses/deletion, orders/reorder/hosted payment recovery |
| P4    | Customer contract inventory and capability boundaries                                                      | Reservations, loyalty, table rounds/payments and transactional push                         |
| P5    | Source build and privacy foundations                                                                       | Website entry, signed APK/update flow, store submissions and two-tenant acceptance          |
| P6    | Runtime directory/configuration foundations                                                                | Third-tenant activation, rollback and support/offboarding proof                             |

## Workflow and dependency gates

The public repository has owner-authorized, no-bypass main/develop protection: PRs, up-to-date required
quality/Sonar checks and resolved threads. Local commits validate an isolated staged snapshot, source
boundaries, secrets, formatting, lint/types, coverage, duplicate rules and tooling. Push repeats checks,
security audit, verified native generation, both platform JS exports and independent review. Merge uses
the workspace gate, requiring a populated Sonar quality gate and zero open PR issues.

Two exact-source dependency repairs are hash/version/lockfile verified and behavior-tested. The raw
registry audit still reports advisories; source-remediated does not mean registry-clean. New or
unverified findings fail closed. Native generation verifies the pinned SDK-matching template archive;
Expo's embedded mismatched template is not used. OTA updates remain disabled.

## Tenant and account isolation

The app resolves approved origins through an expiring trusted directory. Requests capture immutable
environment, tenant and generation. Tenant switches/endpoint changes abort old work; query/storage
keys include the relevant account or guest. Redirects and unapproved origins are refused. QR references
provide navigation, never authorization. A failed/unknown bootstrap cannot unlock a capability.

Email sign-in/restore, registration/recovery request forms and owned profile reads/editing use current
backend contracts. Profile updates send only names/phone; phone removal depends on backend #723.
Secure account writes serialize, logout persists cleanup, and stale/same-user login responses cannot
publish private data. Account-disabled ordering initializes a guest without reading a saved customer's
credentials unless the exact active customer has a scoped pending or accepted order proof. That customer session
is restored only for order recovery/receipts; account actions and new purchases stay blocked. Publisher identities, social audiences, server revocation/deletion and installed keyboard/
secure-store acceptance remain open.

## Menu, choices and basket

Public product keys include tenant generation, locale and requested order type. Product/detail adapters
preserve exact memberships, bundle sections, variation IDs, recipe defaults and no-answer markers.
Unknown manifest versions, ambiguous/future rules and unavailable required choices block projections.
Backend #724 provides the explicit no-answer marker; deployment/readback remains required.

Standalone UI starts with quantity, follows authored variation/recipe/explicit/sides decisions, offers
Next at intermediate steps and one final Add to basket. Full source rules remain available when a
screen shows only a subset, so exclusions also clear hidden choices. Back retains edits within the same owner. Login/controller revisions discard private drafts; failed
product refreshes withdraw ordering even when a cached detail remains. Changed menu
metadata resets to fresh defaults and asks for review. Required sides need current orderable details;
shared product cache keys and at most four concurrent side reads avoid duplicate/per-row requests.
Final projection revalidates every rule and sends identities/quantities/instructions without prices.

Native bundle screens share quantity, nested choice, review and final submission controls with
standalone ordering. Selected sections retain per-bundle portions separately from the parent quantity;
fixed and user-selected variations keep distinct wire identities. Authored component screens appear
only for selected rows. Removing a component clears its notes/choices and transitive dependent choices.
Inactive required dependencies block progress with a return-to-dish explanation. Final review retains
explicit removals, nested sides and component instructions. Unknown rules/unsupported roots block
submission. Query/screen integration verifies private nested notes reset on owner changes; physical
bundle interaction, navigation and screen-reader acceptance remain required.

Basket providers are bound to an initialized, immutable principal and login revision. They restore
only that owner's secure journal, read only the strict native GET, and remove old private queries on
teardown. Failed sign-in also announces an owner revision. Late replies cannot affect another owner. Private basket editors also key teardown on a unique effect-owned workspace version, so a replacement controller/client cannot inherit a draft even when the account and external owner version are identical.
First-open browsing creates neither a session nor HTTP writes. Failed secure restoration/read blocks
new adds. Customers may read their owned older web session; guests require the exact unowned session.
Nil-ID empty responses must have zero totals, no items/owner/discount label, and the requested session.

Durable adds require the dedicated native POST and backend #725's transactional operation receipt.
The exact request and operation/session IDs are verified in SecureStore before dispatch. Identical
active taps coalesce at the controller; UI rejects a competing tap. Unknown/rejected outcomes retain
the journal and block further changes. An ordinary basket GET never acknowledges it. Explicit recovery
replays the original identity; success plus verified secure cleanup releases it. No legacy fallback,
automatic write retry, silent discard or implicit recovery is allowed. Backend #726 provides strict
native GET authentication; its rejection/privacy regression controls distinguish expired JWTs from
empty owned baskets. These backend changes require deployment and the #725 migration before release.

Root quantity/instruction edits and removal have strict typed native adapters and a versioned secure
journal. Old add records restore unchanged. Edits require an existing canonical session, the exact
reviewed basket ID/fingerprint and an explicit absolute quantity with preserved instructions. Add,
update and removal cannot borrow or overwrite one another's pending identity. Unknown and stale
refusals retain the journal; validated readback must still match the expected basket. Logout, late
responses, process/controller restart and storage failures use the same owner/cleanup guards. This
source exposes connected root editing/removal controls. The explicit cancellation adapter first persists the
customer's cancellation choice in the same secure journal; a restart cannot resume original execution.
It sends the exact original body/route/identity to the dedicated cancellation endpoint. Validated
Cancelled proof seals late execution; Applied proof explains the effect already happened, even when
its original basket was erased. It never claims to undo that effect. Contradictory/substituted proof,
storage failures and network errors retain the journal. Lost cleanup acknowledgement can finish from
validated memory proof without another POST. Owner disposal/logout guards both dispatch and cleanup.
Backend #728 supplies the accepted cancellation contract. Its migration/deployment and installed acceptance remain required.
No error or GET permits silent discard.

Basket UI renders server totals and nested composition, retains removals/instructions and exposes
explicit pending-change recovery or a confirmed cancellation check. Cancellation recovery never resumes the original execution. Applied and Cancelled outcomes have distinct announcements. Accepted writes withdraw every other locale quote and refetch the active language without changing the accepted write outcome. Failed reads hide stale totals; unsupported depth/row counts refuse
presentation rather than silently truncating. Persistent menu access returns to the selected basket.
Connected root edits capture the reviewed revision and exact prior instructions; child rows have no independent edit. Removal needs confirmation. Owner changes unmount private drafts, stale revisions block writes, and unsupported server quantities remain visible without clamping. Shared native controls retain scalable labels, 48dp targets and destructive semantic colors. Connected native checkout and order recovery are described below; hosted payment idempotency and provider
settlement are still required. No source helper authorizes automatic order/payment retries or an offline write queue.

## Reviewed channel operations

The native channel adapter validates enabled order types and a read-only conflict preview against the
captured owned basket ID, purchase fingerprint, root identities and quantities. First-install previews
create no session, basket or operation. Existing-session reads preserve the exact principal and reject
substituted revisions or contradictory conflicts. The workspace clones reviewed rows before awaiting
secure credentials, and withdrawn owners cannot dispatch or publish a preview.

Version-3 journal records capture the target channel and the exact confirmed root-removal IDs. Existing
basket changes require their installed canonical session; first-install changes retain the original
session-installation barrier. Add/edit records restore unchanged. Explicit recovery and cancellation
use the saved original channel payload and operation ID. Applied results for an existing basket must
match its reviewed identity before acknowledgement. The backend channel contract is in PR #729;
backend deployment and installed acceptance remain required.

Connected controls load the selected restaurant's currently enabled options only on opening. Selecting
an option reads a preview; it never approves removal. A separate confirmation names every incompatible
root and its quantity, and sends exactly that reviewed removal set. Stale revisions, withdrawn
eligibility/options, competing taps and modal dismissal during a write are blocked. A failed outcome
returns to explicit basket review/recovery. Owner teardown discards the private preview and late reads.
The complete review, error feedback and actions live inside one virtualized list so large text can
scroll the confirmation actions into view without nesting lists in a ScrollView.

## Checkout field contracts

The public form adapter validates unique, bounded form/field identities and consistent visibility,
required and locked flags. Contact rules preserve the name/email floor for every order type and phone
for takeaway/delivery, even when configuration hides it. Delivery retains street/postal-code/city and
honors configured country/additional-information rules. Missing known fields or visible unsupported
fields block projection rather than silently reducing requirements; unrelated future forms and hidden
optional fields remain compatible. Connected native fields follow these current requirements; private order
receipts, hosted payment recovery and installed form acceptance remain required.

## Checkout quote contract

The native quote adapter submits only the six server review fields, with the installed owner-scoped
basket session. It checks restaurant/bootstrap, basket revision, channel, currency, root identities,
variation/quantity/notes, requested points/tip and available methods before publishing a response.
The basket owner workspace supplies the reviewed state and installed session, refuses unresolved
basket operations and withdraws work on logout/disposal. It snapshots basket roots, bootstrap and
review choices before asynchronous credential reads without creating a session or operation.
Composition parsing checks depth and the complete row budget before recursive decoding; signed
component modifiers and current fractional-cent discount rules remain representable. A quote creates
no durable order/payment operation and transport failures are not automatically retried.
The basket opens a native contact/address form for ready takeaway/delivery orders. Contact floors and
current tenant form rules are validated before server review. Optional tips accept decimal amounts;
loyalty-point selection remains open. The customer explicitly selects a currently offered payment
method and places the order after reviewing server totals. Changed requirements, basket revisions,
withdrawn owners and competing taps block submission. Closing or changing owner discards private
form drafts. Checkout actions remain in a scrollable modal with scalable labels and 48dp controls.

## Durable native order acceptance

Preparation obtains the server's digest of the captured typed intent without creating a durable
operation. Before acceptance, the secure repository verifies contact and minimal proof readback.
Only the new native submit endpoint is used. The journal retains the original tenant/principal,
session, operation ID and payload hash; an unknown outcome blocks basket changes and new orders.
Basket and order claims share the same serialized secure-storage queue, so concurrent controllers
cannot each install an independent financial identity. Identical active requests coalesce.

Explicit recovery reads the saved operation; an Unseen response never resends an order or releases
the hold. A separate confirmed stop request persists cancellation before dispatch, purges contact
and can only resume the cancellation check after restart. Applied proof means the restaurant received
the order; cancellation cannot undo that order or refund a payment. Cancelled proof permits fresh
basket review. A validated decision is securely retained before proof cleanup; failed cleanup can
finish from memory without another POST. A lost deletion acknowledgement keeps an explicit local
confirmation action visible even after the proof key is gone. Minimal decision history is bounded and is cleared on
logout; the pending proof survives separately until a server decision. Contact data is purged on
logout. React Query stores only minimal pending state and validated outcome, never the contact/digest.

Supported active/read-only restaurants retain order recovery after ordering/account withdrawal.
Guests send only the original operation session. Customer credentials are loaded only after matching
the original pending proof's environment, tenant and principal. Disabled accounts never unlock profile,
login or new purchasing actions. When guest ordering remains enabled, a resolved customer may explicitly
sign out and continue as a guest; failed secure logout retains a visible cleanup retry.

The additive backend acceptance contract depends on the accepted operation-store migration and the
native endpoints accepted in backend #736. Its final server money comparison and strict points debit
remain authoritative. The native online-payment capability stays unavailable until central return
association and the release gates pass. Source-only canonical payment decisions and private receipts/history
are described below. Migration application, deployment/readback, installed secure recovery and
physical checkout acceptance remain separate release gates.

## Native payment recovery foundation

An online order's original proof includes a non-contact marker before submission. Applied acceptance
verifies a minimal payment record in SecureStore before releasing the order claim; interrupted receipt
persistence or lost storage acknowledgement keeps the original identity recoverable. Payment records
contain the original tenant/environment, principal, session/operation/digest and order reference, with
pending/terminal state and the frozen server expiry. They contain no customer contact, JWT or hosted URL.
Logout removes ordinary credentials/contact/history while retaining this minimal financial proof.

Pending payments block new basket/order claims and forgetting their original receipt. Only the
source-only dedicated payment decision contract can release the hold with paid/expired/failed;
ready and unknown outcomes remain pending, and neither local expiry, fulfillment nor browser closure
proves a payment outcome. Late or contradictory owner/order/operation/expiry decisions are refused.
The old unused order-status-derived scaffold has been removed. Native online payment remains
unavailable until central link association and release acceptance pass. The connected source flow is
described below.
Storage source checks are separate from deployed backend, provider and installed-device acceptance.

## Native and device evidence

Both iOS/Android JS exports pass a measured bundle budget. Verified native generation and an Android
ARM64 debug compiler/install/launch check passed. Android release manifest inspection excludes
microphone/storage/overlay permissions; that is separate from a fully built/signed release APK.
iOS generation is source evidence; local Xcode/CoreSimulator compatibility still needs resolution.
Android safe-area checks covered large text and dark landscape for the restaurant-entry surface.
They do not establish the new ordering screens' device acceptance or cold/cached-menu timings.

Pending physical checks include VoiceOver/TalkBack, large text/RTL/both themes on all journeys,
keyboard/back/gesture focus, secure process death and concurrent recovery, two-tenant switching,
verified links, provider returns, notification taps and actual store/APK updates. Useful cached menu
<2s and cold online menu <3s need named physical devices and network conditions. Expo/EAS ownership,
Apple/Google publisher accounts, signing, hosted builds and store distribution remain owner-side gates.

## Native saved receipts

The Orders destination lists at most 32 local decisions for the current restaurant and principal.
Only the selected accepted order makes a receipt request, using its original session/hash/operation
proof and customer JWT when applicable. These secrets remain in SecureStore; Query contains minimal
local descriptors and the private receipt projection. This is device-saved history, not customer-wide
historical order synchronization. Explicit refresh reads status without replaying checkout or payment. A definitive HTTP 401 may
serialize one credential renewal and retry only the same receipt read, including after a recovery-only
restart or a directory transition to read-only. Read-only renewal requires the exact saved applied
receipt proof, customer owner guard and the dedicated credential mode restricted to the refresh route;
ordinary login and writes stay refused. Logout during credential-header loading prevents dispatch. Owner/proof guards still apply; permission, local refusal and contract errors never renew.
A failed status refresh withdraws the previous receipt display until a fresh authorized response.

Fulfillment and payment labels are separate. Display uses the frozen receipt currency and server
restaurant timezone, preserves historical names/ingredients/instructions after catalogue deletion,
and virtualizes bounded composition. Unknown status values show a neutral unavailable label.
Removing a receipt requires confirmation, blocks its unresolved pending identity, clears its query
value and local proof, and never cancels an order or refunds money. Logout/tenant/controller changes
withdraw late responses and old private data. Recovery-only customers may explicitly sign out and
continue as guests after pending order and payment resolution; secure-cleanup failure keeps a usable retry.
Backend #737 and the operation migrations must be released before connected device acceptance.
Installed status updates, font/RTL/screen-reader behavior, process death and receipt privacy remain
required physical acceptance. Provider payment acceptance, cancellation/reorder and module completion remain open.

## Native account deletion

The account screen offers a restaurant/account-specific confirmation with the existing 30-day
schedule, explicit-login cancellation and retained financial-record disclosure. It reads current
status before offering a request, never automatically retries that write, and checks status after
an unknown response. Repeated server requests preserve the first date. A failed status check
withdraws the displayed date; a foreground return rechecks status. Results are kept in the current
screen only, with current-session and tenant transport guards; no deletion status is persisted in
public storage. Sign-out reuses the existing secure cleanup flow.

This consumes the additive backend deletion contract in backend PR #739. Backend acceptance and
release precede dependent mobile publication. Scheduling is not immediate erasure or email-delivery
proof. Existing web confirmation and cleanup remain authoritative. Apple/provider revocation, push
subscription erasure, signed installed-device cleanup and the full deletion journey remain open.

## Native saved addresses

The account screen can open a virtualized saved-address list using the new current-customer,
versioned backend read contract. It loads one bounded page at a time and discards private query
resources on dismissal. Previous/next navigation is explicit; a cursor never selects another
customer. Unknown fields, contradictory continuation, duplicate/out-of-order IDs and regressing
pages are refused. Character limits preserve valid Unicode database text.

Failed refresh hides cached private rows; foreground return performs a new read. Owner/tenant
switches and logout cannot publish a late result.

Native create/edit/remove/default controls use the same labelled fields, semantic tokens and shared
modal/buttons. Required and Unicode storage validation runs before sending. Editing preserves null
optional values and never sends coordinates or owner/policy fields. Default/remove require an
address-specific confirmation; existing OrderAddress snapshots remain separate from saved addresses.
A synchronous decision lock prevents duplicate presses and busy dismissal. Unknown responses block
another submission and offer a return to a freshly read list for explicit checking. No write uses
automatic retry, token refresh or an offline queue. Create is not idempotent: a fresh read cannot
prove an earlier request will never arrive, and it must not automatically trigger another create.
Private form state is discarded on dismissal or owner withdrawal.

This consumes the pending versioned native mutation contract and shared backend address hardening.
Backend acceptance/deployment must precede dependent app publication. Delivery checkout offers an
explicit saved-address picker with the same bounded private list and read-failure withdrawal.
It replaces the checkout modal while open; cancellation retains manually entered details.
Selection fills the draft only and does not mutate addresses, quote or submit an order. Apartment
and region are combined into visible street/locality fields without truncation; overlong combined
values remain visible and block review until corrected. Populated imported country/instructions
remain editable even when those optional fields are hidden in the restaurant form policy. Checkout
wire bounds explicitly match server UTF-16 validation; saved-address storage bounds count code points. Optional absent phone retains the entered
contact phone. Explicit selection never replaces name/email/tip, and closing removes private query
resources. The current session guard rejects withdrawn-owner callbacks. Existing server quote and
order contracts remain authoritative after the customer reviews the selected details.

Complete locale/RTL coverage and installed keyboard/screen-reader/process-death acceptance remain
required plan work. No tenant activation or signed release is claimed.

## Account-wide order history

Signed-in customers can explicitly open a bounded history list from Orders. The private versioned
read requires the current customer and returns20 summaries per page with paired UTC date/UUID
continuation. The client preserves original cursor precision, checks deterministic date/tie order,
unique IDs, exact last-item continuation and forward progress. Unsupported/private fields,
contradictory nullable money, unknown versions and ambiguous timestamps are refused. Future status
strings display an unavailable update rather than an invented fulfillment or paid state.

Recorded currency is authoritative. Legacy orders without recorded currency remain visible with an
unavailable amount; no current restaurant currency is substituted. Fulfillment, payment status and
current payable total are separate. Dates use the response's validated restaurant timezone.

History and saved addresses reuse one private paging hook: owner-scoped keys, inner bounded server
reads, explicit next/previous navigation, no persistence, no automatic Query retries, foreground checks,
withdrawal during/after failed refresh and query removal on dismissal or scope change. A withdrawn
account cannot reopen its former modal or repopulate a private page after a late HTTP response.
Local saved receipt access remains available through its original guarded proof workflow.

History summaries are source integration work; backend acceptance/readback and installed accessibility
remain open. Detailed account-wide receipts, accepted-order cancellation and revalidated reorder are
still required plan work. No new order, payment, provider or notification action is part of this read.

## Public saved-menu previews

Successful current menu browsing may persist a public text-only projection for offline reading.
The entry is explicit from restaurant discovery, including when the live directory cannot be
reached. It never restores a trusted tenant context or supplies a network origin, capability,
session, checkout option, monetary amount or availability decision. Known current directory
removal/disablement/incompatibility hides a preview. Ordering requires the normal fresh online gates.

The cache has strict versioned per-environment storage, tenant/locale record identities, at most
8 previews and 200 unique public dishes per preview, a 262144 UTF-16-code-unit envelope budget and
7-day display/read TTL. Expired bytes are filtered from reads; replacement and explicit removal
clear stored records. Automatic physical purge remains open. Old/future/invalid/oversized/extra-private data is rejected. Writes/removals serialize;
older replies cannot replace a newer saved record. Oversized single records fail without changing
storage. Storage failures leave online browsing available and are visible for explicit preview reads.

Each preview shows its saved date/language and incomplete-state explanation. The oldest saved page
date is retained across pagination. Names/descriptions and recorded allergens are text only; no
remote images or links are requested. Prices/options remain online because the public catalogue
response does not bind a historical amount to an immutable currency. Search, scalable text and
back/removal/refresh use shared controls and scrollable virtualized lists. Expiry is checked again
on foreground. Physical cached-menu timing, full locales/RTL and offboarding/purge acceptance remain
separate plan requirements.

## Owned historical receipt detail

A selected account-history row opens a single receipt modal through the guarded customer GET.
The response must match the selected UUID; malformed/private extras are rejected. It shares the
bounded frozen-composition renderer with saved local receipts. Currency is the recorded historical
currency only. Legacy null currency hides all monetary rows and line prices with an explanation;
contents, options, quantities and separate payment/fulfillment status remain visible.

Private queries use the current account/version and tenant generation, no retries or persistence,
and zero cache retention. Refresh/foreground reads withdraw stale contents, and dismissal/owner
withdrawal removes private queries. Back returns to the bounded history list; native modal escape
and Close dismiss the flow. Real backend ownership, deployed readback, installed large-text/screen-
reader behavior and full cancellation/reorder remain distinct acceptance gates.

The source-only payment adapter reads the dedicated original-proof recovery decision. Its exact
POST route and payment-only credential-renewal route require the retained payment record, original
session/digest/operation/order and a current owner guard. A customer HTTP 401 can renew once through
the existing serialized session authority; local refusals, other HTTP statuses, tenant changes and
logout cannot replay it. Account-disabled restoration also recognizes the payment proof independently
of receipt history. This does not establish deployed contract or installed browser acceptance.

## Connected hosted payment source flow

The root payment provider restores the original SecureStore record, requests its dedicated canonical
decision, durably verifies it and exposes only masked order/operation/state/action data to queries and
UI. Orders shows separate payment and fulfillment messages. Ready may open the same hosted page in
the system browser; pending/unknown exposes only a check action. A browser result never books money.
Close, launch failure, foreground and bounded pending polling reconcile the original operation.
Canonical terminal decisions refresh purchase holds. Pending payments block recovery-only guest
continuation in both basket and saved-order UI, including the final action after stale availability.

`EXPO_PUBLIC_HOSTED_CHECKOUT_ORIGINS` is an explicit JSON array of approved canonical HTTPS origins,
maximum ten unique entries. Missing/invalid configuration permits no hosted browser opening; ordinary
browsing and payment-status recovery remain available. Server approval is independently required.
Hosted pages reject userinfo, fragments, nonstandard ports, whitespace/control/backslash input,
unapproved origins and the original local deadline. URLs remain ephemeral and are never persisted.

The central return route validates the configured origin, fresh directory tenant and exact UUID order
and operation references; duplicate or extra query data is refused. It navigates to original-proof
Orders recovery only. A cold launch may restore the approved tenant. A callback cannot overwrite a
newer different selection; switching back needs an explicit customer action. Link references grant no
order, payment or login authority. Actual OS domain association, shared-service landing/deployment,
provider app switching, signed installations and device/process-death acceptance remain open. Backend
#743 remains a draft until the required connected return contract is complete; no native payment
activation follows from these source tests.
