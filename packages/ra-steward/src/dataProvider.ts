import type { DataProvider, GetListParams, GetListResult, RaRecord } from "react-admin";
import type { StewardClient, Query } from "./client.js";
import type { ActionStates, ListAnswer, RecordPageAnswer, RowMeta } from "./protocol.js";

/**
 * Where a list or a record comes from, passed as React Admin's `meta`: every answer is the
 * projection of one place of a page.
 */
export type Place =
  | { service: string; widget: string; of?: string }
  | { service: string; widget: string; filterOptions: string }
  | { service: string; picker: { action: string; field: string; key?: string } }
  | { service: string; page: string };

/** The meta of a row, kept in the record under this key (no field of a model is named so). */
export const ROW_META = "__steward";

/** The meta of the record of a record page: its actions, title, global actions and cards. */
export interface PageRecordMeta extends RowMeta {
  toolbar?: ActionStates;
  cards?: Record<string, RowMeta>;
}

export const rowMeta = (record: RaRecord | undefined): PageRecordMeta => (record?.[ROW_META] as PageRecordMeta | undefined) ?? {};

const placeOf = (meta: unknown): Place => {
  const place = (meta as { steward?: Place } | undefined)?.steward;
  if (!place) throw new Error("ra-steward: a request without its place (meta.steward)");
  return place;
};

const listQuery = (params: GetListParams, search?: boolean): Query => {
  const filter: Record<string, unknown> = {};
  let q: string | undefined;
  for (const [k, v] of Object.entries(params.filter ?? {})) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "q" && search) q = String(v);
    else filter[k] = v;
  }
  const sort = params.sort?.field ? (params.sort.order === "DESC" ? "-" : "") + params.sort.field : undefined;
  return {
    filter: Object.keys(filter).length ? JSON.stringify(filter) : undefined,
    sort,
    page: params.pagination?.page,
    perPage: params.pagination?.perPage,
    q,
  };
};

const toListResult = (answer: ListAnswer, page: number): GetListResult => ({
  data: answer.data.map((row) => ({ ...row, [ROW_META]: answer.meta.rows[String(row.id)] ?? {} }) as unknown as RaRecord),
  ...(answer.total === null
    ? { pageInfo: { hasNextPage: answer.hasMore, hasPreviousPage: page > 1 } }
    : { total: answer.total }),
  meta: answer.meta,
});

const notSupported = (what: string) => () =>
  Promise.reject(new Error(`ra-steward: ${what} is an action of a steward service, run with runAction.`));

/**
 * The data provider of steward services. Every call names the place it is for in `meta.steward`:
 * a table (`{service, widget}`), a related table (`of`), a picker of a form, the options of a
 * reference filter, or a record page (`{service, page}`). Creating, changing and deleting are
 * actions.
 */
export const stewardDataProvider = (client: StewardClient): DataProvider => ({
  async getList(_resource, params) {
    const place = placeOf(params.meta);
    const page = params.pagination?.page ?? 1;
    if ("picker" in place) {
      const { action, field, key } = place.picker;
      const answer = await client.request<ListAnswer>(place.service, ["actions", action, "pick", field], {
        query: { ...listQuery(params, true), key },
      });
      return toListResult(answer, page);
    }
    if ("filterOptions" in place) {
      const answer = await client.request<ListAnswer>(place.service, ["widgets", place.widget, "filters", place.filterOptions], {
        query: listQuery(params, true),
      });
      return toListResult(answer, page);
    }
    if ("widget" in place) {
      const answer = await client.request<ListAnswer>(place.service, ["widgets", place.widget], {
        query: { ...listQuery(params), of: place.of },
      });
      return toListResult(answer, page);
    }
    throw new Error("ra-steward: getList of a page");
  },

  async getManyReference(resource, params) {
    const place = placeOf(params.meta);
    return this.getList(resource, { ...params, meta: { steward: { ...place, of: String(params.id) } } });
  },

  async getOne(_resource, params) {
    const place = placeOf(params.meta);
    if (!("page" in place)) throw new Error("ra-steward: getOne outside of a record page");
    const answer = await client.request<RecordPageAnswer>(place.service, ["pages", place.page, String(params.id)]);
    const meta: PageRecordMeta = {
      ...(answer.meta.actions ? { actions: answer.meta.actions } : {}),
      title: answer.title,
      toolbar: answer.meta.toolbar,
      cards: answer.meta.cards,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: { ...answer.data, [ROW_META]: meta } as any };
  },

  async getMany(resource, params) {
    const service = (params.meta as { steward?: { service: string } } | undefined)?.steward?.service;
    if (!service) throw new Error("ra-steward: getMany without its service");
    const answer = await client.request<{ data: { id: unknown; title: string }[] }>(service, ["titles", resource], {
      query: { ids: params.ids.map(String).join(",") },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: answer.data.map((r) => ({ id: r.id, [ROW_META]: { title: r.title } })) as any };
  },

  create: notSupported("create"),
  update: notSupported("update"),
  updateMany: notSupported("updateMany"),
  delete: notSupported("delete"),
  deleteMany: notSupported("deleteMany"),
});
