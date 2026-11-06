import { MenuItem, Select } from "@mui/material";
import { Admin, AppBar, CustomRoutes, Layout, TitlePortal, type LayoutProps } from "react-admin";
import { Navigate } from "react-router-dom";
import { createSteward, StewardMenu, StewardPanel } from "ra-steward";
import { MapPoint, OrderTimeline, SalesChart, SplitBar } from "./registry";

/** Who the demo asks as: the example's server reads it from the header X-User. */
const user = () => localStorage.getItem("steward-demo.user") ?? "admin";

const steward = createSteward({
  baseUrl: "/admin",
  headers: () => ({ "X-User": user() }),
  components: { SalesChart, OrderTimeline },
  cells: { MapPoint, SplitBar },
});

const UserSwitch = () => (
  <Select
    size="small"
    value={user()}
    onChange={(e) => {
      localStorage.setItem("steward-demo.user", String(e.target.value));
      window.location.reload();
    }}
    sx={{ color: "inherit", ".MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.5)" }, mr: 1 }}
  >
    <MenuItem value="admin">admin</MenuItem>
    <MenuItem value="clerk">clerk</MenuItem>
  </Select>
);

const DemoAppBar = () => (
  <AppBar toolbar={<UserSwitch />}>
    <TitlePortal />
  </AppBar>
);

/** React Admin's layout, the services' menu, and the panel over the page. */
const DemoLayout = (props: LayoutProps) => (
  <steward.Provider>
    <Layout {...props} menu={StewardMenu} appBar={DemoAppBar} />
    <StewardPanel />
  </steward.Provider>
);

const Home = () => <Navigate to="/s/shop/dashboard" replace />;

export const App = () => (
  <Admin dataProvider={steward.dataProvider} layout={DemoLayout} dashboard={Home} title="Steward demo">
    <CustomRoutes>{steward.routes}</CustomRoutes>
  </Admin>
);
