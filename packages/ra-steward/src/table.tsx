import { Alert, Box, alpha, useTheme } from "@mui/material";
import { useEffect, type ReactElement } from "react";
import {
  AutocompleteArrayInput,
  AutocompleteInput,
  Datagrid,
  DatagridBody,
  DatagridRow,
  DateInput,
  DateTimeInput,
  FilterForm,
  ListBase,
  NullableBooleanInput,
  NumberInput,
  Pagination,
  ReferenceArrayInput,
  ReferenceInput,
  SelectArrayInput,
  SelectInput,
  TextInput,
  useListContext,
  useRecordContext,
  type DatagridRowProps,
  type RaRecord,
} from "react-admin";
import { ActionButton } from "./actions.js";
import { targetKey, useDescribe, useOpenPage, usePageHref, wantsNewTab } from "./context.js";
import { rowMeta } from "./dataProvider.js";
import type { ActionStates, ButtonDesc, ColumnDesc, FilterDesc, InputKind, TableDesc, Target } from "./protocol.js";
import { ColumnValue } from "./values.js";
import { pageSizeOptions, parseDateTime, referencePageSize } from "./inputs.js";

/** No ordering: the server's default (React Admin would otherwise sort by id). */
export const NO_SORT = { field: "", order: "ASC" as const };

export interface PickerPlace {
  action: string;
  field: string;
  key?: string;
}

/**
 * A table of a page as the server describes it: its rows from the server, its filters, sort and
 * page kept in the store under its id. For a related table, @of@ is the key of the page's record;
 * for a picker of a form, @picker@ names it and @onPick@ takes the row clicked.
 */
export const StewardTable = ({
  service,
  desc,
  of,
  picker,
  onPick,
}: {
  service: string;
  desc: TableDesc;
  of?: string;
  picker?: PickerPlace;
  onPick?: (record: RaRecord) => void;
}) => {
  const describe = useDescribe(service);
  const place = picker ? { service, picker } : { service, widget: desc.id, ...(of ? { of } : {}) };
  return (
    <ListBase
      resource={desc.resource}
      queryOptions={{ meta: { steward: place } }}
      perPage={desc.perPage ?? describe.data?.pageSize ?? 25}
      sort={desc.sort ?? NO_SORT}
      filterDefaultValues={desc.initialFilters}
      storeKey={`steward.${service}.${picker ? `${picker.action}.${picker.field}` : desc.id}`}
      disableSyncWithLocation
    >
      <TableView service={service} desc={desc} picking={!!picker} onPick={onPick} />
    </ListBase>
  );
};

const TableView = ({ service, desc, picking, onPick }: { service: string; desc: TableDesc; picking: boolean; onPick?: (record: RaRecord) => void }) => {
  const { meta, error, perPage, setPerPage } = useListContext();
  const describe = useDescribe(service);
  const maxPageSize = describe.data?.maxPageSize ?? 200;
  useEffect(() => {
    if (perPage > maxPageSize) setPerPage(referencePageSize(describe.data));
  }, [describe.data, maxPageSize, perPage, setPerPage]);
  const openPage = useOpenPage();
  const theme = useTheme();
  const filters = desc.filters.flatMap((f) => filterInput(service, desc, f, picking, referencePageSize(describe.data)) ?? []);
  const toolbar = meta?.toolbar as ActionStates | undefined;
  return (
    <Box>
      {(filters.length > 0 || desc.toolbarActions.length > 0) && (
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, flexWrap: "wrap", mb: 1 }}>
          {filters.length > 0 ? <FilterForm filters={filters} /> : null}
          <Box sx={{ flex: 1 }} />
          {desc.toolbarActions.map((b, i) => (
            <ActionButton key={i} service={service} button={b} states={toolbar} origin="toolbar" />
          ))}
        </Box>
      )}
      {error ? <Alert severity="error">{error.message}</Alert> : null}
      <Datagrid
        bulkActionButtons={false}
        body={<DatagridBody row={<TaggedRow target={onPick ? null : desc.rowClick} />} />}
        rowClick={
          onPick
            ? (_id, _resource, record) => {
                onPick(record);
                return false;
              }
            : desc.rowClick
              ? (_id, _resource, record) => {
                  const target = desc.rowClick!;
                  openPage(target.service, target.page, targetKey(target, record));
                  return false;
                }
              : false
        }
        rowSx={(record: RaRecord) => {
          const tint = rowMeta(record).color;
          return tint ? { backgroundColor: alpha(theme.palette[tint].main, 0.08) } : {};
        }}
      >
        {[
          ...desc.columns.map((c) => (
            <StewardField
              key={c.id}
              column={c}
              service={service}
              source={c.source ?? c.id}
              label={c.label}
              sortBy={c.sortBy ?? undefined}
              sortable={!!c.sortBy}
              textAlign={c.align === "right" ? "right" : undefined}
            />
          )),
          ...(desc.rowActions.length > 0 && !picking ? [<RowActions key="actions" service={service} buttons={desc.rowActions} label="" />] : []),
        ]}
      </Datagrid>
      <Pagination rowsPerPageOptions={pageSizeOptions(maxPageSize, perPage)} />
    </Box>
  );
};

/** Whether a click is on a control of the row (a link, a button, an input) and not on the row. */
const onControl = (e: React.MouseEvent) => !!(e.target as HTMLElement).closest("a, button, input, [role=button]");

/**
 * A row with the classes the server gave it, prefixed "tag-", for the admin's own CSS. When a click
 * on it opens a page, Ctrl/Cmd/Shift+click or the middle button opens it in a new tab.
 */
const TaggedRow = ({ target, ...props }: DatagridRowProps & { target?: Target | null }) => {
  const record = useRecordContext();
  const hrefOf = usePageHref();
  const tags = (rowMeta(record).classes ?? []).map((c) => `tag-${c}`);
  const newTab = (e: React.MouseEvent) => {
    if (!target || !wantsNewTab(e) || onControl(e)) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(hrefOf(target.service, target.page, targetKey(target, record)), "_blank", "noopener");
  };
  return (
    <DatagridRow
      {...props}
      className={[props.className, ...tags].filter(Boolean).join(" ")}
      onClickCapture={newTab}
      onAuxClick={newTab}
      onMouseDown={(e: React.MouseEvent) => {
        if (target && e.button === 1) e.preventDefault();
      }}
    />
  );
};

/** A cell of a column, with its buttons. */
export const StewardField = ({ column, service }: { column: ColumnDesc; service: string; source: string; label: string; sortBy?: string; sortable?: boolean; textAlign?: "right" }) => {
  const record = useRecordContext();
  if (!record) return null;
  const meta = rowMeta(record);
  return (
      <ColumnValue column={column} record={record} meta={meta} renderButtons={(c) => c.buttons.map((b, i) => (
        <ActionButton key={i} service={service} button={b} record={record} states={meta.actions} origin="row" />
      ))} />
  );
};

const RowActions = ({ service, buttons }: { service: string; buttons: ButtonDesc[]; label: string }) => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end", flexWrap: "wrap" }}>
      {buttons.map((b, i) => (
        <ActionButton key={i} service={service} button={b} record={record} states={rowMeta(record).actions} origin="row" />
      ))}
    </Box>
  );
};

const choices = (input: InputKind) => (input.type === "select" ? input.options.map((o) => ({ id: o.value, name: o.label })) : []);

const titleOf = (r: RaRecord) => rowMeta(r).title ?? String(r.id);

/** The input of a filter; a reference filter picks from the records the server offers for it. */
const filterInput = (service: string, desc: TableDesc, f: FilterDesc, picking: boolean, perPage: number): ReactElement | null => {
  const common = { source: f.name, label: f.label, alwaysOn: true };
  const options = { meta: { steward: { service, widget: desc.id, filterOptions: f.name } } };
  const input = f.input;
  switch (input.type) {
    case "select":
      return <SelectInput key={f.name} {...common} choices={choices(input)} />;
    case "reference":
      return picking ? null : (
        <ReferenceInput key={f.name} {...common} reference={input.resource} queryOptions={options} sort={NO_SORT} perPage={perPage}>
          <AutocompleteInput label={f.label} optionText={titleOf} filterToQuery={(q: string) => ({ q })} sx={{ minWidth: 200 }} />
        </ReferenceInput>
      );
    case "list":
      if (input.of.type === "select") return <SelectArrayInput key={f.name} {...common} choices={choices(input.of)} sx={{ minWidth: 200 }} />;
      if (input.of.type === "reference")
        return picking ? null : (
          <ReferenceArrayInput key={f.name} {...common} reference={input.of.resource} queryOptions={options} sort={NO_SORT} perPage={perPage}>
            <AutocompleteArrayInput label={f.label} optionText={titleOf} filterToQuery={(q: string) => ({ q })} sx={{ minWidth: 240 }} />
          </ReferenceArrayInput>
        );
      return null;
    case "number":
      return <NumberInput key={f.name} {...common} />;
    case "date":
      return <DateInput key={f.name} {...common} />;
    case "datetime":
      return <DateTimeInput key={f.name} {...common} parse={parseDateTime} />;
    case "bool":
      return <NullableBooleanInput key={f.name} {...common} />;
    default:
      return <TextInput key={f.name} {...common} />;
  }
};
