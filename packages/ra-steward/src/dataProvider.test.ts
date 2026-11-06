import { afterEach, describe, expect, it, vi } from "vitest";
import { StewardClient, StewardError } from "./client";
import { ROW_META, stewardDataProvider } from "./dataProvider";

const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const list = { data: [{ id: "p1", code: "BOOK-1" }], total: null, hasMore: true, meta: { rows: { p1: { color: "info" } }, toolbar: { enabled: [], disabled: {} } } };

const setup = (body: unknown = list, status = 200, headers: Record<string, string> = {}) => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => answer(body, status, headers));
  vi.stubGlobal("fetch", fetch);
  const onVersion = vi.fn();
  const client = new StewardClient({ baseUrl: "/admin", headers: () => ({ "X-User": "clerk" }), onVersion });
  return { fetch, onVersion, provider: stewardDataProvider(client) };
};

afterEach(() => vi.unstubAllGlobals());

const params = { pagination: { page: 2, perPage: 10 }, sort: { field: "price", order: "DESC" as const }, filter: { status: ["draft"], q: "" } };

describe("the data provider", () => {
  it("asks a table for its rows, with the filters as JSON, and keeps the meta of the rows in them", async () => {
    const { fetch, provider } = setup();
    const result = await provider.getList("Models.Product", { ...params, meta: { steward: { service: "shop", widget: "products/drafts.0" } } });
    const url = new URL(fetch.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/admin/shop/widgets/products%2Fdrafts.0");
    expect(Object.fromEntries(url.searchParams)).toEqual({ filter: '{"status":["draft"]}', sort: "-price", page: "2", perPage: "10" });
    expect(result.data[0][ROW_META]).toEqual({ color: "info" });
    expect(result.pageInfo).toEqual({ hasNextPage: true, hasPreviousPage: true });
    expect(result.total).toBeUndefined();
    expect((fetch.mock.calls[0][1]?.headers as Record<string, string>)["X-User"]).toBe("clerk");
  });

  it("asks a related table with the key of the page's record", async () => {
    const { fetch, provider } = setup();
    await provider.getManyReference("Models.OrderItem", { ...params, target: "product", id: "p2", meta: { steward: { service: "shop", widget: "product.1.1.0" } } });
    expect(new URL(fetch.mock.calls[0][0], "http://x").searchParams.get("of")).toBe("p2");
  });

  it("asks a picker with the search as q", async () => {
    const { fetch, provider } = setup();
    await provider.getList("Models.Category", {
      pagination: { page: 1, perPage: 25 },
      sort: { field: "", order: "ASC" },
      filter: { q: "boo" },
      meta: { steward: { service: "shop", picker: { action: "create_product", field: "category" } } },
    });
    const url = new URL(fetch.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/admin/shop/actions/create_product/pick/category");
    expect(url.searchParams.get("q")).toBe("boo");
    expect(url.searchParams.get("sort")).toBeNull();
    expect(url.searchParams.get("filter")).toBeNull();
  });

  it("reads a record page, with its meta in the record", async () => {
    const { fetch, provider } = setup({ data: { id: "p1", code: "BOOK-1" }, title: "BOOK-1", meta: { actions: null, toolbar: { enabled: ["sync_catalog"], disabled: {} }, cards: {} } });
    const { data } = await provider.getOne("Models.Product", { id: "p1", meta: { steward: { service: "shop", page: "product" } } });
    expect(fetch.mock.calls[0][0]).toBe("/admin/shop/pages/product/p1");
    expect(data[ROW_META]).toMatchObject({ title: "BOOK-1", toolbar: { enabled: ["sync_catalog"] } });
  });

  it("reports the version of describe and the errors of the server", async () => {
    const { onVersion, provider } = setup({ message: "Unknown sort: id." }, 400, { "Admin-Version": "abc" });
    await expect(provider.getList("Models.Product", { ...params, meta: { steward: { service: "shop", widget: "products.1" } } })).rejects.toEqual(
      new StewardError(400, "Unknown sort: id."),
    );
    expect(onVersion).toHaveBeenCalledWith("shop", "abc");
  });

  it("refuses a request without its place", async () => {
    const { provider } = setup();
    await expect(provider.getList("Models.Product", params)).rejects.toThrow(/meta.steward/);
  });
});
