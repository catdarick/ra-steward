import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createTheme, ThemeProvider } from "@mui/material";
import { CoreAdminContext, memoryStore, useDataProvider } from "react-admin";
import { MemoryRouter } from "react-router-dom";
import { createSteward, StewardPage, useSteward, pagePath, StewardError } from "ra-steward";

const steward = createSteward({ baseUrl: "https://backend.example/admin", services: ["shop"], headers: () => ({ "X-Host": "shared" }) });
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
queryClient.setQueryData(["steward", "describe", "shop"], {
  service: "shop", version: "v1", menu: [], resources: [], actions: {}, pageSize: 10, maxPageSize: 100,
  pages: { dashboard: { name: "dashboard", title: "Dashboard", record: null, widgets: [{ type: "section", id: "summary", title: "Installed package works", widgets: [] }] } },
});
queryClient.setQueryData(["steward", "page", "shop", "dashboard"], { meta: { actions: { enabled: [], disabled: {} } } });
const Probe = () => {
  assert.equal(useSteward().client, steward.client);
  assert.equal(typeof useDataProvider().getList, "function");
  return createElement(StewardPage, { service: "shop", page: "dashboard", recordKey: null, inPanel: true });
};
const html = renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(ThemeProvider, { theme: createTheme() },
    createElement(CoreAdminContext, { dataProvider: steward.dataProvider, queryClient, store: memoryStore({ locale: "en" }) },
      createElement(steward.Provider, null, createElement(Probe))))));
assert(html.includes("Installed package works"), "The packed library must share the host's query, routing and admin contexts");
assert.equal(pagePath("/services", "shop", "product", "a/b"), "/services/shop/product/a%2Fb");
assert(new StewardError(422, "Invalid") instanceof Error);

let called = false;
globalThis.fetch = async (url, init) => {
  called = true;
  assert.equal(url, "https://backend.example/admin/shop/widgets/dashboard.0?page=1&perPage=10");
  assert.equal(init.headers["X-Host"], "shared");
  return new Response(JSON.stringify({ data: [{ id: "p1", name: "Product" }], total: 1, hasMore: false, meta: { rows: { p1: { title: "Product" } } } }), { status: 200 });
};
const result = await steward.dataProvider.getList("Product", {
  pagination: { page: 1, perPage: 10 }, sort: { field: "", order: "ASC" }, filter: {},
  meta: { steward: { service: "shop", widget: "dashboard.0" } },
});
assert(called);
assert.equal(result.data[0].__steward.title, "Product");
queryClient.clear();
console.log("Packed ESM import, React Admin contexts and provider requests passed");
