# Customer acceptance gates

Implementation follows ../docs/plans/CUSTOMER-MOBILE-APPS-PLAN.md in the workspace.
Source tests, deployment, native compiler output, signing and physical acceptance are separate evidence.
Never enable tenants from fixture data or send production orders, payments or notifications for a test.

| Phase | Current source                                                                                             | Remaining acceptance                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| P0    | Company repository, pinned runtime, customer-only contracts, hooks/CI/review/Sonar                         | Two approved pilot tenants, company publisher accounts and EAS ownership                                       |
| P1    | Menu, guided standalone/bundle choices, owned basket state/read/add/recovery, QR and switching foundations | Checkout/payment return, notification tap and physical iPhone/Android journeys                                 |
| P2    | Trusted directory/bootstrap, context cancellation, scoped storage/transport and native generation          | Shared host deployment, verified links, full localization/RTL, signed reproducible builds                      |
| P3    | Email accounts, profile editing, durable basket operation contract and native ordering controls            | Social/verification/reset links, addresses/deletion, basket editing, checkout, orders/reorder/payment recovery |
| P4    | Customer contract inventory and capability boundaries                                                      | Reservations, loyalty, table rounds/payments and transactional push                                            |
| P5    | Source build and privacy foundations                                                                       | Website entry, signed APK/update flow, store submissions and two-tenant acceptance                             |
| P6    | Runtime directory/configuration foundations                                                                | Third-tenant activation, rollback and support/offboarding proof                                                |

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
credentials. Publisher identities, social audiences, server revocation/deletion and installed keyboard/
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
teardown. Failed sign-in also announces an owner revision. Late replies cannot affect another owner.
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
source does not expose edit controls yet. The explicit cancellation adapter first persists the
customer's cancellation choice in the same secure journal; a restart cannot resume original execution.
It sends the exact original body/route/identity to the dedicated cancellation endpoint. Validated
Cancelled proof seals late execution; Applied proof explains the effect already happened, even when
its original basket was erased. It never claims to undo that effect. Contradictory/substituted proof,
storage failures and network errors retain the journal. Lost cleanup acknowledgement can finish from
validated memory proof without another POST. Owner disposal/logout guards both dispatch and cleanup.
Backend publication, cancellation migration/deployment and connected controls remain required.
No error or GET permits silent discard.

Basket UI renders server totals and nested composition, retains removals/instructions and exposes
explicit pending-add recovery. Failed reads hide stale totals; unsupported depth/row counts refuse
presentation rather than silently truncating. Persistent menu access returns to the selected basket.
Connected editing/removal, channel selection, checkout, order/payment idempotency and provider
settlement are still required. No source helper authorizes automatic order/payment retries or an offline write queue.

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
