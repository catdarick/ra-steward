# Working on ra-steward

This repository contains the React Admin package in `packages/ra-steward`, its demo in
`demo`, and browser tests in `e2e`. Use npm through the Taskfile:

- `task typecheck`
- `task test`
- `task build`
- `task test:package`
- `task pack`
- `task e2e`

`task build` builds compiled ESM/types for the library and the demo. `task test:package`
installs the npm archive into an independent React Admin app and checks its types, contexts
and production build. The canonical license is the root `LICENSE`; builds copy it into the
package. See `docs/releasing.md` for tag-driven npm and GitHub releases.

The typecheck, unit tests and build do not require Haskell or a backend checkout. The demo
and browser tests use `STEWARD_URL`, defaulting to `http://127.0.0.1:8080` (or `PORT`).
`UI_PORT` sets the demo's port, defaulting to 5174.

Browser tests require steward's shop example, including its `POST /reset` endpoint. Start it
in the backend repository, or set `STEWARD_DIR` to that checkout to let Playwright run
`task server` there. Do not assume any layout for the backend checkout.

The HTTP contract is maintained in the backend repository's `docs/protocol.md`; the frontend
types are in `packages/ra-steward/src/protocol.ts`. `npm run icons` regenerates the icon
loaders locally. Keep `scripts/mui-icons.txt` in sync with the backend when updating MUI.
