# ra-steward

Pages, tables, forms and actions for [React Admin](https://marmelab.com/react-admin/),
described by a steward backend. Add it to an existing admin alongside your own resources.

## Install

```sh
npm install ra-steward react-admin react react-dom @mui/material @mui/icons-material \
  @emotion/react @emotion/styled @tanstack/react-query react-router-dom react-hook-form
```

Use React Admin 5.15+, React 18 or 19, MUI 7 or 9, React Router 6.28.1+ or 7,
TanStack Query 5 and React Hook Form 7.66+. Keep a single compatible installation of each
peer so the library shares the host's contexts. The package contains ESM JavaScript and
TypeScript declarations; no TypeScript or JSX compilation of the library is needed.
It targets ES2022 and is intended for React apps using a bundler, such as Vite or webpack.

## A standalone admin

```tsx
import { Admin, CustomRoutes } from "react-admin";
import { createSteward } from "ra-steward";

// Create once, outside the component, to keep contexts and version state stable.
const steward = createSteward({ baseUrl: "/admin" });

export const App = () => (
  <Admin dataProvider={steward.dataProvider} layout={steward.Layout}>
    <CustomRoutes>{steward.routes}</CustomRoutes>
  </Admin>
);
```

The default routes are `/s/:service/:page` and `/s/:service/:page/:key`. Use
`routePrefix` to place them elsewhere. `baseUrl` points at the backend's service root,
not the frontend route. A development proxy or your server must route that path to steward.

## An existing React Admin app

```tsx
import {
  Admin, combineDataProviders, CustomRoutes, Layout, Menu, Resource,
  type LayoutProps,
} from "react-admin";
import { createSteward, StewardMenuItems, StewardPanel } from "ra-steward";
import { authProvider, hostDataProvider, PostList, readToken } from "./host";

const steward = createSteward({
  baseUrl: "/admin",
  routePrefix: "/services",
  headers: () => ({ Authorization: `Bearer ${readToken()}` }),
});

const dataProvider = combineDataProviders(resource =>
  resource === "posts" ? hostDataProvider : steward.dataProvider
);

const HostMenu = () => (
  <Menu>
    <Menu.ResourceItem name="posts" />
    <StewardMenuItems />
  </Menu>
);

const HostLayout = (props: LayoutProps) => (
  <steward.Provider>
    <Layout {...props} menu={HostMenu} />
    <StewardPanel />
  </steward.Provider>
);

export const App = () => (
  <Admin dataProvider={dataProvider} authProvider={authProvider} layout={HostLayout}>
    <Resource name="posts" list={PostList} />
    <CustomRoutes>{steward.routes}</CustomRoutes>
  </Admin>
);
```

The host owns authentication, theme, query client and routing. `headers` is called for each
request so it can read the current token. `StewardMenuItems` adds service navigation;
`StewardPanel` handles record previews and action navigation. Every steward data-provider
request carries its location in `meta.steward`; select providers so steward resources reach
`steward.dataProvider`.

For custom widgets and cells, pass `components` and `cells` to `createSteward`. Their props
are described by the exported `WidgetComponent` and `CellComponent` types. `services`
optionally limits the services shown; otherwise the backend supplies the list. Protocol
types, `StewardClient`, `StewardPage`, `StewardTable`, navigation hooks and row metadata
helpers are also exported from `ra-steward`.

Steward's backend `docs/protocol.md` defines the HTTP contract. The backend must provide
the describe, page, widget, picker and action endpoints used by its pages. Browser apps
using an absolute backend URL also need the backend's CORS configuration to allow the
frontend origin and authentication headers.
