import { createRoot } from "react-dom/client";
import {
  Admin, combineDataProviders, CustomRoutes, defaultDataProvider, Layout, List, Datagrid, Menu, Resource, TextField,
  type AuthProvider, type DataProvider, type LayoutProps,
} from "react-admin";
import {
  createSteward, StewardMenuItems, StewardPanel, type StewardConfig, type CellComponent,
  type WidgetComponent, type Place, type PageRef, type PageRecordMeta,
} from "ra-steward";

const Chart: WidgetComponent = ({ data }) => <div>{JSON.stringify(data)}</div>;
const Point: CellComponent = ({ value }) => <span>{String(value)}</span>;
const config: StewardConfig = {
  baseUrl: "/admin", routePrefix: "/services", services: ["shop"],
  headers: () => ({ Authorization: "Bearer host-token" }),
  components: { Chart }, cells: { Point },
};
const steward = createSteward(config);
const place: Place = { service: "shop", page: "product" };
const ref: PageRef = { service: "shop", page: "product", key: "1" };
const meta: PageRecordMeta = { title: ref.key ?? "", toolbar: { enabled: [], disabled: {} } };

const hostDataProvider: DataProvider = {
  ...defaultDataProvider,
  getList: async () => ({ data: [], total: 0 }),
};
const dataProvider = combineDataProviders((resource) => resource === "posts" ? hostDataProvider : steward.dataProvider);
const authProvider: AuthProvider = {
  login: async () => {}, logout: async () => {}, checkAuth: async () => {},
  checkError: async () => {}, getPermissions: async () => [],
};
const PostList = () => <List><Datagrid><TextField source="title" /></Datagrid></List>;
const HostMenu = () => <Menu><Menu.ResourceItem name="posts" /><StewardMenuItems /></Menu>;
const HostLayout = (props: LayoutProps) => (
  <steward.Provider><Layout {...props} menu={HostMenu} /><StewardPanel /></steward.Provider>
);
const App = () => (
  <Admin dataProvider={dataProvider} authProvider={authProvider} layout={HostLayout}>
    <Resource name="posts" list={PostList} />
    <CustomRoutes>{steward.routes}</CustomRoutes>
  </Admin>
);

// The provider can also be used directly with the typed steward place.
void (() => steward.dataProvider.getOne("Product", { id: "1", meta: { steward: place } }));
createRoot(document.getElementById("root")!).render(<App />);
