# Customer mobile development rules

React Native + Expo SDK 56, React 19, TypeScript strict, Expo Router. Native UI uses StyleSheet.
Read docs/development.md and docs/acceptance.md. Routes orchestrate; hooks own state;
services own API calls; domain functions own shared business rules.

- No any, ts-ignore, disabled lint rules, embedded secrets, API origin literals or console payloads.
- All requests capture immutable environment/tenant context. Query and storage keys include
  environment, tenant and account/guest identity. Reject unapproved origins and redirects.
- Access/refresh tokens, guest-order and table-participant capabilities use SecureStore only.
- No automatic retry of a financial/order write without a proven server idempotency contract.
- Server totals are authoritative. Unknown payment outcomes remain pending with no charge retry.
- Purchased modules, operational flags, lifecycle and compatibility are separate fail-closed gates.
- One shared Button, Field, Screen, feedback pattern and semantic theme. Labels/errors/a11y
  strings use i18next. Buttons have roles, readable labels, state and at least 48dp targets.
- Support font scaling, RTL, keyboard dismissal, native back and safe areas. Virtualize catalogues.
- Components <=250 lines, hooks/services <=200, domain/types <=150. Generated contracts excluded.
- DRY: extract a shared rule when repeated; do not create generic abstractions for one callsite.
- npm run check: formatting, lint, types, architecture/security, tests/coverage and duplication.
  npm run build: both native JavaScript bundles with a measured budget. Device timing is separate.
- Commit only on feature/fix/chore/docs branches with pathspec. Never bypass hooks.
  PRs target develop. main receives release PRs only. Push requires the workspace's fail-closed
  review gate. Merge only via scripts/pr-merge-gate.sh in the workspace; Sonar setup is required.
- No OTA updates. Never publish artifacts, push notifications or real orders for a test.
