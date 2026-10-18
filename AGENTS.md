# Sofra customer mobile

Read CLAUDE.md and docs/development.md before changes. Follow the workspace GitFlow and
review gate. This repository excludes the previous mobile project entirely.
Use existing feature services and semantic native components. Extract repeated business rules
into pure domain functions; do not import Next.js, DOM or browser storage code.
Run npm run check before a commit. All network, persistence and device boundaries need validation.
Never mark a device, provider, store or tenant acceptance gate complete from unit tests alone.
