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
Registration and recovery request forms add validation and generic email instructions; their own
review/CI acceptance is required. Verification/reset-link integration, social sign-in, profile editing,
saved addresses, server revocation, deletion and device-wide logout remain required.

Source evidence includes mobile unit/component tests, adversarial hook controls, backend policy/HTTP
tests and iOS/Android JavaScript exports. Public browsing and account sources are tested; no signed
native builds, native timing, full RTL/localization, safe checkout or installed-app journeys passed.

The repository is public by explicit owner authorization. Active no-bypass main/develop rules
require PRs, up-to-date quality and Sonar checks, and resolved review threads. Sonar is registered
and bound to the repository. Local hooks also reject direct protected-branch updates.
Publisher/signing accounts and Expo/EAS ownership remain pending owner setup.
