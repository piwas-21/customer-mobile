# Customer acceptance gates

Implementation follows ../docs/plans/CUSTOMER-MOBILE-APPS-PLAN.md in the workspace.
A checked test is source evidence only. Record device/provider/store evidence separately.

| Phase | Gate                                                                         | State                           |
| ----- | ---------------------------------------------------------------------------- | ------------------------------- |
| P0    | Company repo, pinned SDK, local/CI quality workflow                          | Merged to develop with CI/Sonar |
| P0    | Generated customer-only OpenAPI and baseline fixtures                        | Merged to develop with CI/Sonar |
| P0    | Two pilot tenant IDs, publisher identities, EAS project and signing          | Unverified                      |
| P1    | Native menu/customization/basket/payment/QR/switching slice                  | In development                  |
| P1    | Physical iPhone + Android, process death and provider redirects              | Unverified                      |
| P2    | Trusted directory, bootstrap, isolated storage/requests, links               | In development                  |
| P2    | Reproducible signed native builds and cross-tenant server rejection          | Unverified                      |
| P3    | Accounts/deletion, ordering/history/reorder and payment recovery             | In development                  |
| P4    | Reservations, loyalty, table payments, durable transactional push            | Pending                         |
| P5    | Website entry, APK/store installs and channel updates, two tenant acceptance | Pending                         |
| P6    | Third tenant runtime onboarding, rollback and support                        | Pending                         |

Never enable a tenant from fixture/demo data. No production channels are available in this repo.

Restaurant-gated sign-in/restore, owned profile reads and durable local logout merged through PR #2.
Registration and recovery request forms merged through PR #3 with validation and generic email
instructions. Verification/reset-link integration, social sign-in, profile editing,
saved addresses, server revocation, deletion and device-wide logout remain required.

Source evidence includes mobile unit/component tests, adversarial hook controls, backend policy/HTTP
tests and iOS/Android JavaScript exports. Public browsing and account sources are tested; no signed
native builds, native timing, full RTL/localization, safe checkout or installed-app journeys passed.

The repository is public by explicit owner authorization. Active no-bypass main/develop rules
require PRs, up-to-date quality and Sonar checks, and resolved review threads. Sonar is registered
and bound to the repository. Local hooks also reject direct protected-branch updates.
Publisher/signing accounts and Expo/EAS ownership remain pending owner setup.

Detailed product reads now validate the response bundle shape, stable association IDs, choice groups,
nested ingredient/variation/side rules, recorded allergens and customer-step manifests. A zero sauce
maximum means no sauces; a null maximum remains unlimited (backend SauceGroupRule is authoritative). Product hooks
partition public detail by restaurant generation, locale and requested order type; unexpected product
identities are rejected. This adapter is preparation for customization: quantity/choice screens and
server basket writes remain required. Unknown enum values/manifest versions are preserved and must
block unsupported ordering projections. Contract/API tests are source evidence; no device journey passed.

Customization selection projections map explicit group memberships and bundle section rows to their
exact server identities. Explicit group limits count distinct choices, with separate ingredient unit
caps and one unit per product option. Repeatable bundle sections count portions; non-repeatable
sections count rows. Optional bundle minima follow the server rule. Unavailable/future/ambiguous
rules fail closed, defaults are bounded and deterministic, and projections perform no network writes.
Legacy recipe/sauce interactions, manifest-driven step order, nested UI and full basket composition
remain required before ordering acceptance.

Legacy recipe projections retain complete fixed/included defaults, explicit removals and per-row
quantity limits. Sauce minima count distinct answers; zero caps, no-answer markers and exclusion
keys are preserved without guessing from labels. Missing bundle marker metadata or inconsistent
base recipes block this projection. The additive server marker contract is backend PR #724 and
must land before its dependent mobile source; deployment/readback remains separate. Full manifest
composition, variation/side integration, native choice screens and basket writes remain required.

Variation projections preserve exact IDs, deterministic active defaults, and the server's base-row
fallback when all variations are inactive. Suggested sides retain association and product IDs
separately, require current orderable detail reads, seed required sides, and validate each selected
variation and quantity. Side DTOs cannot express nested required groups or sauce choices; those
shapes are unavailable in this projection. These pure projections do not fetch, write or calculate prices. Nested
manifest composition, native UI and complete basket submission remain required.

Basket transport can combine a customer's exact scoped access token and basket session, or use a
guest's session without borrowing customer credentials. Canonical UUID sessions and immutable wire
bodies are checked before dispatch. This adapter creates no session and retries no write; durable
operation persistence, principal lifecycle guards, native basket UI and server integration remain
required before submission is available.
