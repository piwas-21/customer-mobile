# Security boundaries and release holds

The directory origin is build configuration. QR URLs never select an arbitrary API. Tenant contexts
capture immutable endpoint and cancellation state. SecureStore is scoped by environment and tenant;
customer JWT, basket session and table participant are distinct. Transport refuses redirects,
malformed envelopes and late responses; no request retries writes automatically.

## Known dependency findings

Registry npm audit still reports two high advisory roots. Both are repaired in installed source:

- node-forge 1.4.0: exact rsa.js backport from upstream open PR1152 commit
  ceba34402e329f0365134f23fe19898756527d65, rejecting extra nested DigestAlgorithm elements.
- braces 3.0.3: reviewed bounded parser/AST traversal hardening for braces, parentheses,
  stringify/invalid-dollar paths, direct AST input and cycles. It is our fix, not an upstream release.

Package identities and versions stay unchanged. security/remediations.json records original and
repaired hashes, exact transformations and provenance. npm run dependencies:prepare applies only
known original bytes; npm run check refuses missing/changed repairs. npm run audit:security retains
raw npm audit output and proves full transitive root/copy coverage plus exploit controls before
recognizing source remediation. Unknown advisories and failures remain blocking. No exception or
risk acceptance substitutes for repaired code. Tests include original-source negative controls,
public upstream RSA vectors and signatures constructed with independent Node crypto.

Before distribution: confirm publisher/signing identity, verify directory TLS and association files,
backend cross-tenant rejection, server idempotency, account deletion, provider callback reconciliation,
source-map privacy and Expo/Sentry processor inventory. Keep checkout/push/SSO disabled meanwhile.
