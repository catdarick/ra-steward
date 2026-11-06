import { Alert, Box, Card, CardContent, Tab, Tabs, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { Loading, RecordContextProvider, Title, useGetOne, useRecordContext, type RaRecord } from "react-admin";
import { useParams } from "react-router-dom";
import { ActionButton } from "./actions.js";
import { PagePlaceContext, useDescribe, useSteward } from "./context.js";
import { rowMeta } from "./dataProvider.js";
import type { ActionStates, GlobalPageAnswer, PageDesc, WidgetDesc } from "./protocol.js";
import { StewardTable } from "./table.js";
import { ColumnValue } from "./values.js";
import { QueryError } from "./feedback.js";

/** What the widgets of a page share: its service, the key of its record, its global actions. */
interface PageState {
  service: string;
  recordKey: string | null;
  toolbar?: ActionStates;
}

const PageStateContext = createContext<PageState | null>(null);

const usePageState = () => {
  const state = useContext(PageStateContext);
  if (!state) throw new Error("ra-steward: a widget outside of a page");
  return state;
};

const recordPlace = (service: string, page: string) => ({ steward: { service, page } });

/** The title of a page: its own, or its record's. */
export const usePageTitle = (service: string, page: string, recordKey: string | null): string | undefined => {
  const describe = useDescribe(service);
  const desc = describe.data?.pages[page];
  const record = useGetOne(desc?.record ?? "", { id: recordKey ?? "", meta: recordPlace(service, page) }, { enabled: !!desc?.record && !!recordKey });
  return desc?.record ? rowMeta(record.data).title : desc?.title ?? undefined;
};

/** A page of a service: its title (in the app bar, unless it is shown in the panel) and its widgets. */
export const StewardPage = ({ service, page, recordKey, inPanel = false }: { service: string; page: string; recordKey: string | null; inPanel?: boolean }) => {
  const describe = useDescribe(service);
  if (describe.isPending) return <Loading />;
  if (describe.error) return <QueryError error={describe.error} retry={describe.refetch} />;
  const desc = describe.data.pages[page];
  if (!desc) return <Alert severity="warning">This page is not available.</Alert>;
  return desc.record ? (
    <RecordPage service={service} desc={desc} recordKey={recordKey} inPanel={inPanel} />
  ) : (
    <GlobalPage service={service} desc={desc} inPanel={inPanel} />
  );
};

const RecordPage = ({ service, desc, recordKey, inPanel }: { service: string; desc: PageDesc; recordKey: string | null; inPanel: boolean }) => {
  const { data: record, error, isPending, refetch } = useGetOne(desc.record!, { id: recordKey ?? "", meta: recordPlace(service, desc.name) }, { enabled: !!recordKey });
  if (!recordKey) return <Alert severity="warning">This page needs a record.</Alert>;
  if (isPending) return <Loading />;
  if (error) return <QueryError error={error} retry={refetch} />;
  const meta = rowMeta(record);
  return (
    <RecordContextProvider value={record}>
      {!inPanel && <Title title={meta.title ?? ""} />}
      <PageStateContext.Provider value={{ service, recordKey, toolbar: meta.toolbar }}>
        <Widgets widgets={desc.widgets} />
      </PageStateContext.Provider>
    </RecordContextProvider>
  );
};

const GlobalPage = ({ service, desc, inPanel }: { service: string; desc: PageDesc; inPanel: boolean }) => {
  const { client } = useSteward();
  const state = useQuery({
    queryKey: ["steward", "page", service, desc.name],
    queryFn: () => client.request<GlobalPageAnswer>(service, ["pages", desc.name]),
    retry: false,
  });
  if (state.error) return <QueryError error={state.error} retry={state.refetch} />;
  if (state.isPending) return <Loading />;
  return (
    <RecordContextProvider value={undefined}>
      {!inPanel && <Title title={desc.title ?? ""} />}
      <PageStateContext.Provider value={{ service, recordKey: null, toolbar: state.data?.meta.actions }}>
        <Widgets widgets={desc.widgets} />
      </PageStateContext.Provider>
    </RecordContextProvider>
  );
};

const Widgets = ({ widgets }: { widgets: WidgetDesc[] }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, py: 1 }}>
    {widgets.map((w) => (
      <Widget key={w.id} widget={w} />
    ))}
  </Box>
);

const merged = (a?: ActionStates, b?: ActionStates): ActionStates | undefined =>
  a || b ? { enabled: [...(a?.enabled ?? []), ...(b?.enabled ?? [])], disabled: { ...a?.disabled, ...b?.disabled } } : undefined;

const Widget = ({ widget }: { widget: WidgetDesc }) => {
  const { service, recordKey, toolbar } = usePageState();
  const record = useRecordContext();
  switch (widget.type) {
    case "toolbar":
      return (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {widget.buttons.map((b, i) => (
            <ActionButton key={i} service={service} button={b} record={record} states={merged(rowMeta(record).actions, toolbar)} origin="page" size="medium" />
          ))}
        </Box>
      );
    case "section":
      return (
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {widget.title}
          </Typography>
          <Widgets widgets={widget.widgets} />
        </Box>
      );
    case "grid":
      return (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 2, alignItems: "start" }}>
          {widget.widgets.map((w) => (
            <Widget key={w.id} widget={w} />
          ))}
        </Box>
      );
    case "tabs":
      return <TabsWidget tabs={widget.tabs} />;
    case "card":
      return <CardWidget id={widget.id} title={widget.title} columns={widget.columns} record={record} />;
    case "component":
      return <ComponentWidget service={service} id={widget.id} name={widget.component} recordKey={recordKey} record={record} />;
    case "table":
      return <StewardTable service={service} desc={widget} of={widget.related ? (recordKey ?? undefined) : undefined} />;
  }
};

const TabsWidget = ({ tabs }: { tabs: { title: string; widgets: WidgetDesc[] }[] }) => {
  const [active, setActive] = useState(0);
  return (
    <Box>
      <Tabs value={Math.min(active, tabs.length - 1)} onChange={(_, v: number) => setActive(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
        {tabs.map((t, i) => (
          <Tab key={i} label={t.title} />
        ))}
      </Tabs>
      <Widgets widgets={tabs[Math.min(active, tabs.length - 1)]?.widgets ?? []} />
    </Box>
  );
};

const CardWidget = ({ id, title, columns, record }: { id: string; title: string; columns: import("./protocol").ColumnDesc[]; record?: RaRecord }) => {
  const { service } = usePageState();
  if (!record) return null;
  const meta = rowMeta(record).cards?.[id] ?? {};
  return (
    <Card variant="outlined">
      <CardContent>
        {title && (
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 500 }}>
            {title}
          </Typography>
        )}
        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "minmax(120px, auto) 1fr", columnGap: 2, rowGap: 1, m: 0 }}>
          {columns.map((c) => (
            <Box key={c.id} sx={{ display: "contents" }}>
              <Typography component="dt" variant="body2" color="text.secondary">
                {c.label}
              </Typography>
              <Box component="dd" sx={{ m: 0, textAlign: c.align === "right" ? "right" : undefined }}>
                <ColumnValue column={c} record={record} meta={meta} renderButtons={(column) => column.buttons.map((b, i) => (
                  <ActionButton key={i} service={service} button={b} record={record} states={meta.actions} origin="page" />
                ))} />
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

/** A component of the admin's registry, with the data the server loads for it. */
const ComponentWidget = ({ service, id, name, recordKey, record }: { service: string; id: string; name: string; recordKey: string | null; record?: RaRecord }) => {
  const { client, config } = useSteward();
  const data = useQuery({
    queryKey: ["steward", "component", service, id, recordKey],
    queryFn: () => client.request<unknown>(service, ["widgets", id, "data"], { query: { key: recordKey } }),
  });
  const Component = config.components?.[name];
  if (!Component) return <Alert severity="info">No component "{name}" in the registry.</Alert>;
  if (data.error) return <QueryError error={data.error} retry={data.refetch} />;
  return data.isPending ? <Loading /> : <Component data={data.data} record={record} />;
};

/** The route of a page: `${prefix}/:service/:page/:key?`. Closing it goes back. */
export const StewardRoute = () => {
  const { service, page, key } = useParams();
  if (!service || !page) return null;
  return (
    <PagePlaceContext.Provider value={{ service, page, key: key ?? null, inPanel: false, close: () => window.history.back() }}>
      <StewardPage key={`${service}/${page}/${key ?? ""}`} service={service} page={page} recordKey={key ?? null} />
    </PagePlaceContext.Provider>
  );
};
