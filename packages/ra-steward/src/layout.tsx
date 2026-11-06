import { Box, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Toolbar, Tooltip, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { useId, useState, type ReactNode } from "react";
import { Layout, Menu, useSidebarState, type LayoutProps } from "react-admin";
import { PagePlaceContext, pagePath, usePageHref, type PageRef, usePanel, useDescribe, useServices, useSteward, wantsNewTab } from "./context.js";
import type { MenuEntry, Width } from "./protocol.js";
import { StewardPage, usePageTitle } from "./page.js";
import { Icon } from "./values.js";

const humanize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ");

/** The menu items of the services, to put in a menu of the admin's own. */
export const StewardMenuItems = () => {
  const services = useServices();
  return (
    <>
      {services.map((s) => (
        <ServiceMenu key={s} service={s} titled={services.length > 1} />
      ))}
    </>
  );
};

/** A menu of the services' items alone. */
export const StewardMenu = () => (
  <Menu>
    <StewardMenuItems />
  </Menu>
);

const ServiceMenu = ({ service, titled }: { service: string; titled: boolean }) => {
  const describe = useDescribe(service);
  const [open] = useSidebarState();
  const entries = describe.data?.menu ?? [];
  if (entries.length === 0) return null;
  return (
    <>
      {titled && open && <ListSubheader sx={{ lineHeight: "32px", bgcolor: "transparent" }}>{humanize(service)}</ListSubheader>}
      {entries.map((e, i) => (
        <MenuEntryItem key={i} service={service} entry={e} depth={0} />
      ))}
    </>
  );
};

const MenuEntryItem = ({ service, entry, depth }: { service: string; entry: MenuEntry; depth: number }): ReactNode => {
  const { config } = useSteward();
  const [expanded, setExpanded] = useState(true);
  if (entry.type === "page") {
    return (
      <Menu.Item
        to={pagePath(config.routePrefix ?? "/s", service, entry.page)}
        primaryText={entry.label}
        leftIcon={<Icon name={entry.icon ?? "Article"} color={entry.color} />}
        sx={{ pl: 2 + depth * 2 }}
      />
    );
  }
  return (
    <>
      <ListItemButton onClick={() => setExpanded((x) => !x)} sx={{ pl: 2 + depth * 2 }}>
        <ListItemIcon sx={{ minWidth: 40 }}>
          <Icon name={entry.icon ?? "Folder"} color={entry.color} />
        </ListItemIcon>
        <ListItemText primary={entry.label} />
        {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </ListItemButton>
      <Collapse in={expanded} unmountOnExit>
        <List disablePadding>
          {entry.items.map((e, i) => (
            <MenuEntryItem key={i} service={service} entry={e} depth={depth + 1} />
          ))}
        </List>
      </Collapse>
    </>
  );
};

const PANEL_WIDTHS: Record<Exclude<Width, number>, number> = { xs: 360, sm: 480, md: 720, lg: 960, xl: 1200 };

/**
 * The panel over the page, where links, rows and actions open pages: the last page it opened, with
 * a way back to the one before, and a way to open it as a page of its own. Closing a page goes
 * back, closing the panel with its first.
 */
export const StewardPanel = () => {
  const panel = usePanel();
  const top = panel.pages[panel.pages.length - 1];
  return top ? <PanelOf top={top} panel={panel} /> : null;
};

const PanelOf = ({ top, panel }: { top: PageRef; panel: ReturnType<typeof usePanel> }) => {
  const describe = useDescribe(top.service);
  const hrefOf = usePageHref();
  const titleId = useId();
  const width = describe.data?.pages[top.page]?.panelWidth ?? "md";
  return (
    <PagePlaceContext.Provider value={{ ...top, inPanel: true, close: panel.back }}>
      <Drawer
        anchor="right"
        open
        onClose={panel.close}
        slotProps={{ paper: { sx: { width: typeof width === "number" ? width : PANEL_WIDTHS[width], maxWidth: "100%" }, role: "dialog", "aria-labelledby": titleId } }}
      >
        <Toolbar disableGutters sx={{ px: 2, gap: 1 }}>
          {panel.pages.length > 1 && (
            <IconButton aria-label="Back" edge="start" onClick={panel.back}>
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography id={titleId} component="h2" variant="h6" sx={{ flex: 1 }} noWrap>
            <PanelTitle service={top.service} page={top.page} recordKey={top.key} />
          </Typography>
          <Tooltip title="Open as a page">
            <IconButton
              aria-label="Open as a page"
              href={hrefOf(top.service, top.page, top.key)}
              onClick={(e: React.MouseEvent) => {
                if (wantsNewTab(e)) return;
                e.preventDefault();
                panel.expand();
              }}
            >
              <OpenInFullIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton aria-label="Close" onClick={panel.close}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
        <Box sx={{ px: 2, pb: 2, overflow: "auto" }}>
          <StewardPage key={`${top.service}/${top.page}/${top.key ?? ""}/${panel.pages.length}`} service={top.service} page={top.page} recordKey={top.key} inPanel />
        </Box>
      </Drawer>
    </PagePlaceContext.Provider>
  );
};

const PanelTitle = ({ service, page, recordKey }: { service: string; page: string; recordKey: string | null }) => <>{usePageTitle(service, page, recordKey) ?? ""}</>;

/** React Admin's layout with the services' menu and the panel over the page. */
export const StewardLayoutBody = (props: LayoutProps) => (
  <>
    <Layout menu={StewardMenu} {...props} />
    <StewardPanel />
  </>
);
