# Security boundaries and release holds

The directory origin is build configuration. QR URLs never select an arbitrary API. Tenant contexts
capture immutable endpoint and cancellation state. SecureStore is scoped by environment and tenant;
customer JWT, basket session and table participant are distinct. Transport refuses redirects,
malformed envelopes and late responses; no request retries writes automatically.

## Known dependency findings

The 2026-10-18 full npm audit includes upstream high advisories for braces (GHSA-vfj7-8cjw-p6xm)
and node-forge (GHSA-86w9-cpqp-85rv), with no patched npm version available at implementation time.
These enter through Expo/Metro/Jest build tooling. Do not suppress npm audit or downgrade the SDK
according to its suggested breaking fix. Pre-push and CI remain blocked at the high-severity audit
until patched dependencies or a separately reviewed upstream remedy is available. This is an
unresolved source/release gate, not an accepted risk or evidence of a safe signed artifact.

Before distribution: confirm publisher/signing identity, verify directory TLS and association files,
backend cross-tenant rejection, server idempotency, account deletion, provider callback reconciliation,
source-map privacy and Expo/Sentry processor inventory. Keep checkout/push/SSO disabled meanwhile.
