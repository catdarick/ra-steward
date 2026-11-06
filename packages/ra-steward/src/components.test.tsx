import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTheme, ThemeProvider } from "@mui/material";
import { DataProviderContext, Form, RecordContextProvider, type RaRecord } from "react-admin";
import { MemoryRouter } from "react-router-dom";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionForm, SubmitAction } from "./actions";
import { StewardClient, StewardError } from "./client";
import { describeKey, StewardProvider, Versions } from "./context";
import { stewardDataProvider } from "./dataProvider";
import { FormInputs } from "./forms";
import { formInitialValues } from "./inputs";
import { StewardPage } from "./page";
import type { ActionDesc, Describe, FormFieldDesc } from "./protocol";
import { ColumnValue } from "./values";
import { StewardTable } from "./table";

// Observe the real React Admin form's public API; replace only the dialog's browser portal.
const observed = vi.hoisted(() => ({ form: undefined as UseFormReturn<FieldValues> | undefined, submit: undefined as ComponentProps<typeof Form>["onSubmit"], referenceSizes: [] as (number | undefined)[] }));
vi.mock("react-admin", async (original) => {
  const actual = await original<typeof import("react-admin")>();
  const { createElement } = await import("react");
  const { useFormContext } = await import("react-hook-form");
  const Probe = () => { observed.form = useFormContext(); return null; };
  return { ...actual, ReferenceInput: (props: ComponentProps<typeof actual.ReferenceInput>) => {
    observed.referenceSizes.push(props.perPage);
    return createElement(actual.ReferenceInput, props);
  }, Form: (props: ComponentProps<typeof Form>) => {
    observed.submit = props.onSubmit;
    return createElement(actual.Form, props, createElement(Probe), props.children);
  } };
});
vi.mock("@mui/material", async (original) => ({
  ...await original<typeof import("@mui/material")>(),
  Dialog: ({ children }: { children: ReactNode }) => createElement("section", { role: "dialog" }, children),
}));

const field = (name: string, input: FormFieldDesc["input"], required = true): FormFieldDesc => ({
  name, label: name, input, required, helperText: null, minLength: null, maxLength: null, minValue: null, maxValue: null,
});
const action: ActionDesc = { id: "Model/edit", record: "Model", label: "Edit", confirm: null, width: "md", form: [field("price", { type: "number", decimals: 2 })] };

const setup = (definition?: Partial<Describe>) => {
  const client = new StewardClient({ baseUrl: "/admin" });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity, gcTime: Infinity } } });
  const describe: Describe = { service: "shop", version: "v1", pageSize: 7, maxPageSize: 10, menu: [], pages: {}, actions: {}, resources: [], ...definition };
  queryClient.setQueryData(describeKey("shop"), describe);
  const render = (children: ReactNode, record?: RaRecord) => renderToStaticMarkup(
    <MemoryRouter><ThemeProvider theme={createTheme()}><QueryClientProvider client={queryClient}><DataProviderContext.Provider value={stewardDataProvider(client)}>
      <StewardProvider config={{ baseUrl: "/admin" }} client={client} versions={new Versions()}>
        <RecordContextProvider value={record}>{children}</RecordContextProvider>
      </StewardProvider>
    </DataProviderContext.Provider></QueryClientProvider></ThemeProvider></MemoryRouter>,
  );
  return { client, queryClient, render };
};

afterEach(() => { observed.form = undefined; observed.submit = undefined; observed.referenceSizes = []; vi.restoreAllMocks(); });

describe("action forms", () => {
  it("uses the action's initial values without importing the surrounding record", async () => {
    const { queryClient, render } = setup();
    queryClient.setQueryData(["steward", "initial", "shop", action.id, "p1"], { data: { price: 18 } });
    const html = render(<ActionForm service="shop" action={action} label="Edit" recordKey="p1" width="md" origin="row" onClose={() => {}} />,
      { id: "p1", price: 20, category: { id: "c1" }, __steward: { title: "Unrelated" } });
    expect(html).toContain('value="18"');
    expect(observed.form?.getValues()).toEqual({ price: 18 });
    expect(await observed.form?.trigger()).toBe(true);
  });

  it("runs a slow action once even when the form is submitted twice", async () => {
    const { client, queryClient, render } = setup();
    queryClient.setQueryData(["steward", "initial", "shop", action.id, "p1"], { data: { price: 18 } });
    let finish!: (value: unknown) => void;
    const request = vi.spyOn(client, "request").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const close = vi.fn();
    render(<ActionForm service="shop" action={action} label="Edit" recordKey="p1" width="md" origin="row" onClose={close} />);
    const submit = observed.submit as (values: FieldValues) => Promise<unknown>;
    const first = submit({ price: 18 });
    await submit({ price: 18 });
    expect(request).toHaveBeenCalledTimes(1);
    finish({ message: "Saved", effects: [] });
    await first;
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("disables submission explicitly while an action is pending", () => {
    const { render } = setup();
    const html = render(<Form record={{ price: 18 }}><SubmitAction label="Save" busy /></Form>);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Save/s);
  });

  it("shows initialization errors without rendering a usable empty form", () => {
    const { queryClient, render } = setup();
    const key = ["steward", "initial", "shop", action.id, "p1"];
    queryClient.setQueryData(key, { data: null });
    queryClient.getQueryCache().find({ queryKey: key })!.setState({ status: "error", error: new StewardError(500, "Cannot load defaults"), data: undefined });
    const html = render(<ActionForm service="shop" action={action} label="Edit" recordKey="p1" width="md" origin="row" onClose={() => {}} />);
    expect(html).toContain("Cannot load defaults");
    expect(html).toContain("Retry");
    expect(html).not.toContain("<form");
  });

  it("accepts null optional embeds, nullable booleans and empty selection lists", async () => {
    const { render } = setup();
    const fields = [{ ...field("details", { type: "json" }, false), fields: [field("city", { type: "text" })] },
      field("approved", { type: "bool" }, false), field("tags", { type: "list", of: { type: "select", options: [{ value: "a", label: "A" }] } })];
    const definition = { ...action, form: fields };
    const html = render(<Form record={formInitialValues(fields)}><FormInputs service="shop" action={definition} recordKey={null} fields={fields} prefix="" /></Form>);
    expect(html).toContain("Include details");
    expect(html).not.toContain('name="details.city"');
    expect(observed.form?.getValues()).toEqual({ details: null, approved: null, tags: [] });
    expect(await observed.form?.trigger()).toBe(true);
  });

  it("validates the children when an optional embedded record is present", async () => {
    const { render } = setup();
    const fields = [{ ...field("details", { type: "json" }, false), fields: [field("city", { type: "text" })] }];
    render(<Form record={{ details: {} }}><FormInputs service="shop" action={{ ...action, form: fields }} recordKey={null} fields={fields} prefix="" /></Form>);
    expect(await observed.form?.trigger()).toBe(false);
  });

  it("sizes reference choices using the service's configured limit", () => {
    const { render } = setup();
    const fields = [field("category", { type: "reference", resource: "Category" })];
    render(<Form record={{ category: null }}><FormInputs service="shop" action={{ ...action, form: fields }} recordKey={null} fields={fields} prefix="" /></Form>);
    expect(observed.referenceSizes).toEqual([7]);
  });
});

describe("pages and columns", () => {
  it("uses card-specific action states and renders buttons nested in joined columns", () => {
    const { queryClient, render } = setup({
      actions: {
        ping: { ...action, id: "ping", record: null, form: null },
        closed: { ...action, id: "closed", record: null, form: null },
      },
      pages: { note: { name: "note", record: "Model", title: null, panelWidth: "md", widgets: [{ type: "card", id: "note.0", title: "Note", columns: [{
        id: "0", label: "Joined", buttons: [], joined: { separator: "/", columns: [{ id: "0.0", source: "name", label: "Name", kind: { type: "text" }, buttons: [
          { kind: "action", action: "ping", label: "Ping", confirm: null, width: "md", hideDisabled: false },
          { kind: "action", action: "closed", label: "Closed", confirm: null, width: "md", hideDisabled: false },
        ] }] },
      }] }] } },
    });
    queryClient.setQueryData(["Model", "getOne", { id: "1", meta: { steward: { service: "shop", page: "note" } } }], {
      id: "1", name: "Note", __steward: { actions: { enabled: [], disabled: {} }, cards: { "note.0": { actions: { enabled: ["ping"], disabled: { closed: "Closed today" } } } } },
    });
    const html = render(<StewardPage service="shop" page="note" recordKey="1" inPanel />);
    expect(html).toContain(">Ping</button>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Closed/s);
  });

  it("opens a followed reference link using the complete path of the row", () => {
    const { render } = setup();
    const html = render(<ColumnValue column={{ id: "0", source: "product", label: "Product", buttons: [], kind: { type: "ref", resource: "Product" }, link: { service: "shop", page: "category", key: "product.category" } }}
      record={{ id: "row", product: { id: "p1", _title: "Product", category: { id: "c1" } } }} meta={{}} />);
    expect(html).toContain('href="/s/shop/category/c1"');
    expect(html).not.toContain('href="/s/shop/category/p1"');
  });

  it("shows global page-state errors instead of enabling actions without states", () => {
    const { queryClient, render } = setup({ pages: { dashboard: { name: "dashboard", title: "Dashboard", record: null, panelWidth: "md", widgets: [] } } });
    const key = ["steward", "page", "shop", "dashboard"];
    queryClient.setQueryData(key, {});
    queryClient.getQueryCache().find({ queryKey: key })!.setState({ status: "error", error: new StewardError(422, "Page unavailable"), data: undefined });
    const html = render(<StewardPage service="shop" page="dashboard" recordKey={null} inPanel />);
    expect(html).toContain("Page unavailable");
    expect(html).toContain("Retry");
  });

  it("uses datetime controls and bounded reference choices in table filters", () => {
    const { render } = setup();
    const html = render(<StewardTable service="shop" desc={{
      type: "table", id: "products.0", resource: "Product", columns: [], initialFilters: {}, sort: null, perPage: 7, rowClick: null, rowActions: [], toolbarActions: [], related: false,
      filters: [
        { name: "category", label: "Category", op: "equals", input: { type: "reference", resource: "Category" } },
        { name: "at", label: "At", op: "at_least", input: { type: "datetime" } },
      ],
    }} />);
    expect(html).toContain('type="datetime-local"');
    expect(observed.referenceSizes).toEqual([7]);
  });
});
