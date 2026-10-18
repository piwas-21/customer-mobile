# Sofra customer mobile

Company-owned native customer app for iOS and Android. One binary resolves restaurant context
from a trusted directory; accounts and APIs stay restaurant-local. The previous mobile project
is not a source or dependency.

Read [development rules](docs/development.md), [acceptance gates](docs/acceptance.md),
[contract baseline](contracts/baseline.json) and [security policy](docs/security.md).

```sh
nvm use
npm ci --ignore-scripts
npm run hooks:install
npm run check
npm run build
```

Set EXPO_PUBLIC_ENVIRONMENT (staging or production), EXPO_PUBLIC_MOBILE_DIRECTORY_ORIGIN and
EXPO_PUBLIC_MOBILE_LINK_ORIGIN to reviewed canonical HTTPS origins in the build environment.
No live tenant or unverified directory defaults are bundled. Run npm start with an Expo development
build. Native identifiers are provisional pending company signing/publisher verification.

Current slice: strict generated customer contracts, isolated tenant/secret/request boundaries,
trusted-link parsing, fail-closed capabilities, pending-payment domain, native restaurant/menu/QR
browsing and enforced quality workflow. Checkout, account operations and customer modules are
still implementation gates. No app-store/APK release or production feature activation exists.
