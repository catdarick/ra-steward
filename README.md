# ra-steward

`ra-steward` is a React Admin 5 frontend for steward services: a data provider and components
that build the pages, tables, forms and actions from the services' describe. It goes into an
ordinary `<Admin>`, next to the admin's own resources and pages.

Install and embed the published library using the [package guide](packages/ra-steward/README.md).
The package ships compiled ESM and TypeScript declarations. The
[release guide](docs/releasing.md) covers npm setup, version tags and GitHub Actions.

```tsx
import { createSteward } from "ra-steward";

const steward = createSteward({
  baseUrl: "/admin",
  headers: () => ({ Authorization: `Bearer ${token()}` }),
  components: { SalesChart, OrderTimeline }, // component @"…" of the pages
  cells: { MapPoint },                       // customKind @"…" of the values
});

<Admin dataProvider={steward.dataProvider} layout={steward.Layout}>
  <CustomRoutes>{steward.routes}</CustomRoutes>
</Admin>
```

- **Pages** are at `/s/:service/:page` and `/s/:service/:page/:key`. One rule says where they
  open, for all of them: the menu opens a page in place; a link, a row, a link button or an
  action's result opens it in the panel on the right (`StewardPanel`). The panel opens what is
  clicked in it in itself, with a way back, and its page as a page of its own on demand; closing
  a page in it goes back to the one before. Its pages are in the URL (`?peek=shop/product/42`),
  so the browser's Back goes back in it and a reload keeps it. Dialogs are for forms and
  confirmations of actions only: looking is in the panel, doing is in a dialog.
- **Links** are links: Ctrl/Cmd/Shift+click or the middle button on a reference, a row or a link
  button opens its page in a new tab of the browser, in place.
- **The menu** of the services is `StewardMenu`, or `StewardMenuItems` inside a menu of the
  admin's own. With a layout of its own, the admin wraps it in `steward.Provider` and puts
  `StewardPanel` next to it, as [the demo](demo/src/App.tsx) does.
- **The data provider** answers for the places of the pages only: every call names its place in
  `meta.steward`. With resources of its own, the admin combines it with its own provider
  (`combineDataProviders`).
- **The registry** of components: a page's `component @"SalesChart"` is drawn by
  `components.SalesChart` with the data the server loads for it, a value's
  `customKind @"MapPoint"` by `cells.MapPoint`; a name the registry lacks is shown as a
  placeholder.
- **Tables** keep their filters, sort and page in React Admin's store, by their ids.
- **Rows** carry the server's meta in `record.__steward` (`rowMeta(record)`): the actions enabled
  for them, their tint, the classes `tag-*` for the admin's CSS, the colors of cells, the values
  of computed columns.

The HTTP protocol is maintained in the backend's `docs/protocol.md`. With the checkouts next
to each other, it is at [../steward/docs/protocol.md](../steward/docs/protocol.md).

## Development

```bash
task dev             # demo at http://127.0.0.1:5174, against the running backend
task typecheck
task test            # unit and release-validation tests; no backend needed
task build           # library JS/types and production demo; no backend needed
task test:package    # install the npm archive into an independent React Admin app
task pack            # build the publishable archive into artifacts/
task e2e             # installs Chromium, starts demo; requires shop backend
```

Node.js 22.12 or later and npm are required. No Haskell installation is needed for the
frontend's typecheck, unit tests or build. The same commands are available through
[Taskfile.yml](Taskfile.yml): `task dev`, `task typecheck`, `task test`, `task build`, `task e2e`
and `task check` (typecheck, unit tests, build and package installation check).

`STEWARD_URL` sets the backend origin, by default `http://127.0.0.1:8080`; `PORT` changes that
default port, and `UI_PORT` changes the demo's port (5174). The demo proxies `/admin` to the
backend. For example, `STEWARD_URL=http://127.0.0.1:8090 UI_PORT=5180 npm run dev`.

For browser tests, run `task server` in a steward backend checkout first. Alternatively,
`STEWARD_DIR=/path/to/steward npm run e2e` starts the example through that checkout's
`task server`, which requires its Haskell toolchain and Task. Only this optional mode uses
the backend's files. Both modes reuse an already running backend and demo.

The demo's header picks the user ("admin" or "clerk"); the example's server puts its data back on
`POST /reset`, which the end-to-end tests call before each test.

`npm run icons` regenerates the icon loaders from this repository's `scripts/mui-icons.txt`.
When changing the MUI icon set, update that list and steward's list together; neither
generator writes into the other repository.

## Contract and regression checks

Action forms use only the initial values returned for that action and prevent concurrent
submissions. Optional embedded records can be included or cleared; nullable booleans keep
their empty state, and lists may be empty. Datetime edits are converted from the user's local
timezone to UTC. Reference inputs and pagination use the service's page-size limits. Loading
errors offer Retry and leave actions unavailable until their state or initial values loads.

`task test` includes component regression tests using the installed React Admin components.
`task e2e` also covers editing references, delayed submissions, failed initialization and
optional form values. No additional testing libraries are needed.

The backend's `protocol:fixtures` task writes actual JSON responses through WAI without a
listening server. Check them against the frontend's TypeScript protocol declarations:

```bash
task --dir /path/to/steward protocol:fixtures FIXTURE_FILE=/tmp/steward-contract.json
STEWARD_CONTRACT_FILE=/tmp/steward-contract.json task test:contract
```

The validator reads `protocol.ts` with the TypeScript compiler; there is no separate runtime
schema to keep synchronized. Ordinary frontend tests continue to work without a backend;
only the generated-response cases are skipped when `STEWARD_CONTRACT_FILE` is unset.

The GitHub Actions workflow always checks the frontend. Set the repository variable
`STEWARD_REPOSITORY` to the backend's `owner/repository` to enable backend tests, generated
contract checks and browser integration. `STEWARD_REF` optionally selects a backend branch or
commit; workflow dispatch can override both values. For a private backend, supply a
`STEWARD_CHECKOUT_TOKEN` secret with read access to that repository. These settings select
checkouts explicitly and do not assume a backend location on a developer's machine.

When `baseUrl` is an absolute URL, root-relative download effects are resolved against its
backend origin. Same-origin installations can continue using a path such as `/admin`.
