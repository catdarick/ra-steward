import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, type RaRecord } from "react-admin";
import { useLocation } from "react-router-dom";
import type { StewardClient } from "./client.js";
import { parsePeek, withPeek, type PageRef } from "./peek.js";
import type { Describe, Target } from "./protocol.js";

export { parsePeek, PEEK, withPeek, type PageRef } from "./peek.js";

/** A component of the admin's registry drawing a widget: given the data the server loads for it. */
export type WidgetComponent = ComponentType<{ data: unknown; record?: RaRecord }>;

/** A component of the admin's registry drawing a value: given the value and the props of its kind. */
export type CellComponent = ComponentType<{ value: unknown; props: unknown; record: RaRecord }>;

export interface StewardConfig {
  /** The base path of the services: "/admin". */
  baseUrl: string;
  /** Headers of every request. */
  headers?: () => Record<string, string>;
  /** The services shown; by default those the server names. */
  services?: string[];
  /** The widgets of the admin's registry (`component @"SalesChart"`), by name. */
  components?: Record<string, WidgetComponent>;
  /** The cells of the admin's registry (`customKind @"MapPoint"`), by name. */
  cells?: Record<string, CellComponent>;
  /** The routes of the pages: `${routePrefix}/:service/:page/:key?`; "/s" by default. */
  routePrefix?: string;
}

/** The version of describe each answer carries, by service. */
export class Versions {
  private versions = new Map<string, string>();
  private listeners = new Set<() => void>();
  set(service: string, version: string) {
    if (this.versions.get(service) === version) return;
    this.versions.set(service, version);
    this.listeners.forEach((l) => l());
  }
  get = (service: string) => this.versions.get(service);
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

interface StewardValue {
  config: StewardConfig;
  client: StewardClient;
  versions: Versions;
}

const StewardContext = createContext<StewardValue | null>(null);

export const StewardProvider = ({ config, client, versions, children }: { config: StewardConfig; client: StewardClient; versions: Versions; children: ReactNode }) => {
  const value = useMemo(() => ({ config, client, versions }), [config, client, versions]);
  return <StewardContext.Provider value={value}>{children}</StewardContext.Provider>;
};

export const useSteward = (): StewardValue => {
  const value = useContext(StewardContext);
  if (!value) throw new Error("ra-steward: use the layout of createSteward, or StewardProvider");
  return value;
};

export const describeKey = (service: string) => ["steward", "describe", service];

/** The describe of a service: read once, and again when an answer carries a newer version. */
export const useDescribe = (service: string) => {
  const { client, versions } = useSteward();
  const query = useQuery({
    queryKey: describeKey(service),
    queryFn: () => client.request<Describe>(service, ["describe"]),
    staleTime: Infinity,
  });
  const latest = useSyncExternalStore(versions.subscribe, () => versions.get(service), () => versions.get(service));
  const { data, refetch } = query;
  useEffect(() => {
    if (data && latest && latest !== data.version) void refetch();
  }, [data, latest, refetch]);
  return query;
};

/** The services shown: those of the config, or those the server names. */
export const useServices = (): string[] => {
  const { config, client } = useSteward();
  const query = useQuery({
    queryKey: ["steward", "services"],
    queryFn: () => client.request<{ services: string[] }>(null, []),
    enabled: !config.services,
    staleTime: Infinity,
  });
  return config.services ?? query.data?.services ?? [];
};

export const pagePath = (prefix: string, service: string, page: string, key?: string | null) =>
  [prefix, service, page, ...(key ? [key] : [])].map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join("/");

/** The place a page is shown in: its service, page and key, whether in the panel, how to close it. */
export interface PagePlace {
  service: string;
  page: string;
  key: string | null;
  inPanel: boolean;
  close: () => void;
}

export const PagePlaceContext = createContext<PagePlace | null>(null);

export const usePagePlace = () => useContext(PagePlaceContext);

/** The URL of a route of the app, for a link or a new tab: with the hash of a hash router. */
export const routeHref = (path: string) =>
  typeof window !== "undefined" && window.location.hash.startsWith("#/") ? `${window.location.pathname}${window.location.search}#${path}` : path;

/** Whether a click asks for a new tab: with Ctrl, Cmd or Shift, or with the middle button. */
export const wantsNewTab = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; button: number }) =>
  e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;

/**
 * The panel over the page: the pages it has opened, the last one shown, and its moves. Its pages
 * are in the URL, so the browser's Back goes back in it and a reload keeps it; the history entry
 * tells how many of its pages were opened by entries of their own, which its Back and close undo.
 */
export const usePanel = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { config } = useSteward();
  const prefix = config.routePrefix ?? "/s";
  const pages = useMemo(() => parsePeek(location.search), [location.search]);
  const depth: number = (location.state as { stewardPanel?: number } | null)?.stewardPanel ?? 0;
  const go = useCallback(
    (next: PageRef[], stewardPanel: number, replace = false) =>
      navigate({ pathname: location.pathname, search: withPeek(location.search, next) }, { replace, state: { stewardPanel } }),
    [location.pathname, location.search, navigate],
  );
  return {
    pages,
    /** Opens the panel on a page: from the page under it. */
    open: useCallback((page: PageRef) => go([page], 1), [go]),
    /** Opens a page in the panel, after the one shown: from the panel. */
    push: useCallback((page: PageRef) => go([...pages, page], depth + 1), [depth, go, pages]),
    /** Back to the page before in the panel, or closes it when there is none. */
    back: useCallback(() => (depth >= 1 ? navigate(-1) : go(pages.slice(0, -1), 0, true)), [depth, go, navigate, pages]),
    close: useCallback(
      () => (pages.length > 0 && depth >= pages.length ? navigate(-pages.length) : go([], 0, true)),
      [depth, go, navigate, pages.length],
    ),
    /** Opens the page shown as a page of its own, closing the panel. */
    expand: useCallback(() => {
      const top = pages[pages.length - 1];
      if (top) navigate(pagePath(prefix, top.service, top.page, top.key));
    }, [navigate, pages, prefix]),
  };
};

/**
 * Opens a page from a link, a row, a button or an action's result: always in the panel — after the
 * page shown when it is opened from the panel. Only the menu opens pages in place.
 */
export const useOpenPage = () => {
  const place = usePagePlace();
  const panel = usePanel();
  const inPanel = place?.inPanel ?? false;
  const { open, push } = panel;
  return useCallback((service: string, page: string, key: string | null) => (inPanel ? push : open)({ service, page, key }), [inPanel, open, push]);
};

/** The URL of a page, for a link or a new tab. */
export const usePageHref = () => {
  const { config } = useSteward();
  const prefix = config.routePrefix ?? "/s";
  return useCallback((service: string, page: string, key: string | null) => routeHref(pagePath(prefix, service, page, key)), [prefix]);
};

/** The key a target opens, from the record of its place. */
export const targetKey = (target: Target, record?: RaRecord): string | null => {
  if (!target.key) return null;
  if (!record) return null;
  if (target.key === "id") return String(record.id);
  const value = target.key.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), record);
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return value === undefined || value === null ? null : String(value);
};
