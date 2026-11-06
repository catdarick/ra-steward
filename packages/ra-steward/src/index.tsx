import type { ReactNode } from "react";
import type { DataProvider, LayoutProps } from "react-admin";
import { Route } from "react-router-dom";
import { StewardClient } from "./client.js";
import { StewardProvider, Versions, type StewardConfig } from "./context.js";
import { stewardDataProvider } from "./dataProvider.js";
import { StewardLayoutBody } from "./layout.js";
import { StewardRoute } from "./page.js";

export interface Steward {
  client: StewardClient;
  /** The data provider of the services; combine it with the admin's own for other resources. */
  dataProvider: DataProvider;
  /** React Admin's layout with the services' menu; or wrap a layout of the admin's own in Provider. */
  Layout: (props: LayoutProps) => ReactNode;
  /** Gives the components of the services their context, around a layout of the admin's own. */
  Provider: (props: { children: ReactNode }) => ReactNode;
  /** The routes of the pages, for `<CustomRoutes>`. */
  routes: ReactNode;
}

/**
 * The frontend of steward services for a React Admin app:
 *
 *     const steward = createSteward({ baseUrl: "/admin", components: { SalesChart } });
 *
 *     <Admin dataProvider={steward.dataProvider} layout={steward.Layout}>
 *       <CustomRoutes>{steward.routes}</CustomRoutes>
 *     </Admin>
 */
export const createSteward = (config: StewardConfig): Steward => {
  const versions = new Versions();
  const client = new StewardClient({ baseUrl: config.baseUrl, headers: config.headers, onVersion: (s, v) => versions.set(s, v) });
  const prefix = config.routePrefix ?? "/s";
  const Provider = ({ children }: { children: ReactNode }) => (
    <StewardProvider config={config} client={client} versions={versions}>
      {children}
    </StewardProvider>
  );
  return {
    client,
    dataProvider: stewardDataProvider(client),
    Provider,
    Layout: (props: LayoutProps) => (
      <Provider>
        <StewardLayoutBody {...props} />
      </Provider>
    ),
    routes: [
      <Route key="page" path={`${prefix}/:service/:page`} element={<StewardRoute />} />,
      <Route key="record" path={`${prefix}/:service/:page/:key`} element={<StewardRoute />} />,
    ],
  };
};

export { StewardClient, StewardError, type ClientOptions, type Query } from "./client.js";
export { pagePath, parsePeek, PEEK, useDescribe, useOpenPage, usePanel, useServices, useSteward, withPeek, type CellComponent, type PageRef, type StewardConfig, type WidgetComponent } from "./context.js";
export { ROW_META, rowMeta, stewardDataProvider, type PageRecordMeta, type Place } from "./dataProvider.js";
export { StewardMenu, StewardMenuItems, StewardPanel } from "./layout.js";
export { StewardPage } from "./page.js";
export type * from "./protocol.js";
export { StewardTable } from "./table.js";
export { Icon } from "./values.js";
