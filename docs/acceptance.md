# Customer acceptance gates

Implementation follows ../docs/plans/CUSTOMER-MOBILE-APPS-PLAN.md in the workspace.
A checked test is source evidence only. Record device/provider/store evidence separately.

| Phase | Gate                                                                         | State                                  |
| ----- | ---------------------------------------------------------------------------- | -------------------------------------- |
| P0    | Company repo, pinned SDK, local/CI quality workflow                          | Local source; audit blocks publication |
| P0    | Generated customer-only OpenAPI and baseline fixtures                        | Local source; audit blocks publication |
| P0    | Two pilot tenant IDs, publisher identities, EAS project and signing          | Unverified                             |
| P1    | Native menu/customization/basket/payment/QR/switching slice                  | In development                         |
| P1    | Physical iPhone + Android, process death and provider redirects              | Unverified                             |
| P2    | Trusted directory, bootstrap, isolated storage/requests, links               | In development                         |
| P2    | Reproducible signed native builds and cross-tenant server rejection          | Unverified                             |
| P3    | Accounts/deletion, ordering/history/reorder and payment recovery             | Pending                                |
| P4    | Reservations, loyalty, table payments, durable transactional push            | Pending                                |
| P5    | Website entry, APK/store installs and channel updates, two tenant acceptance | Pending                                |
| P6    | Third tenant runtime onboarding, rollback and support                        | Pending                                |

Never enable a tenant from fixture/demo data. No production channels are available in this repo.

Source evidence: mobile unit/component tests and adversarial hook controls, backend policy/HTTP tests,
and iOS/Android JavaScript exports. This is an initial foundation/public-browsing slice; no signed
native builds, native timing, full RTL/localization, safe checkout or installed-app journeys passed.

GitHub rejected server branch-ruleset creation for this private repository (HTTP 403: upgrade plan
or make public). Keep it private. Local pre-commit/pre-push guards reject protected branch updates;
server enforcement and Sonar registration remain external setup gates, not verified protections.
