import { Box, Chip, Link, Tooltip } from "@mui/material";
import type { SvgIconProps } from "@mui/material";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { iconLoaders } from "./icons.generated.js";
import type { RaRecord } from "react-admin";
import { targetKey, useOpenPage, usePageHref, useSteward, wantsNewTab } from "./context.js";
import { rowMeta } from "./dataProvider.js";
import type { ColumnDesc, DisplayKind, RowMeta, Target } from "./protocol.js";

const icons = new Map<string, LazyExoticComponent<ComponentType<SvgIconProps>>>();

const iconNamed = (name: string) => {
  let icon = icons.get(name);
  if (!icon && Object.hasOwn(iconLoaders, name)) {
    icon = lazy(iconLoaders[name]);
    icons.set(name, icon);
  }
  return icon;
};

/**
 * An icon of MUI by its name (`Icon.Publish` on the server is "Publish"), loaded when it is first
 * drawn: a bundle holds the icons its pages show alone.
 */
export const Icon = ({ name, ...props }: { name?: string } & SvgIconProps) => {
  const Component = name ? iconNamed(name) : undefined;
  if (!Component) return null;
  return (
    <Suspense fallback={<Box component="span" sx={{ display: "inline-block", width: "1.25rem", height: "1.25rem" }} />}>
      <Component fontSize="small" {...props} />
    </Suspense>
  );
};

/** The value at a dotted path of a record. */
export const valueAt = (record: RaRecord | undefined, source: string): unknown =>
  source.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), record);

const numberFormat = (value: number, decimals: number | null) =>
  new Intl.NumberFormat(undefined, decimals === null ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

const dateOf = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);

/** A value drawn as its kind says. */
export const Value = ({ kind, value, record }: { kind?: DisplayKind; value: unknown; record: RaRecord }): ReactNode => {
  const { config } = useSteward();
  if (value === null || value === undefined || value === "") return null;
  if (!kind) return String(value);
  switch (kind.type) {
    case "text":
      return String(value);
    case "number":
      return typeof value === "number" ? numberFormat(value, kind.decimals) : String(value);
    case "money":
      return typeof value === "number"
        ? new Intl.NumberFormat(undefined, { style: "currency", currency: kind.currency, minimumFractionDigits: kind.decimals, maximumFractionDigits: kind.decimals }).format(value)
        : String(value);
    case "date":
      return typeof value === "string" ? dateOf(value).toLocaleDateString() : String(value);
    case "datetime":
      return typeof value === "string" ? dateOf(value).toLocaleString() : String(value);
    case "bool":
      return value ? kind.yes : kind.no;
    case "choice": {
      const option = kind.options.find((o) => o.value === value);
      if (!option) return String(value);
      return (
        <Chip
          size="small"
          label={option.label}
          color={option.color ?? "default"}
          variant={option.color ? "filled" : "outlined"}
          icon={option.icon ? <Icon name={option.icon} /> : undefined}
        />
      );
    }
    case "ref": {
      const ref = value as { id?: unknown; _title?: string };
      return ref._title ?? String(ref.id ?? "");
    }
    case "list":
      return Array.isArray(value) ? (
        <Box component="span" sx={{ display: "inline-flex", gap: 0.5, flexWrap: "wrap" }}>
          {value.map((v, i) => (
            <span key={i}>
              <Value kind={kind.of} value={v} record={record} />
              {i < value.length - 1 && kind.of.type !== "choice" ? ", " : ""}
            </span>
          ))}
        </Box>
      ) : null;
    case "suffixed":
      return (
        <>
          <Value kind={kind.of} value={value} record={record} /> {kind.suffix}
        </>
      );
    case "custom": {
      const Cell = config.cells?.[kind.component];
      return Cell ? (
        <Cell value={value} props={kind.props} record={record} />
      ) : (
        <Tooltip title={`No cell "${kind.component}" in the registry`}>
          <span>{JSON.stringify(value)}</span>
        </Tooltip>
      );
    }
  }
};

/**
 * A link to a page: a click opens it in the panel; Ctrl/Cmd/Shift+click or the middle button, in a
 * new tab of the browser, as any link.
 */
export const PageLink = ({ service, page, recordKey, children }: { service: string; page: string; recordKey: string | null; children: ReactNode }) => {
  const openPage = useOpenPage();
  const hrefOf = usePageHref();
  return (
    <Link
      href={hrefOf(service, page, recordKey)}
      underline="hover"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        if (wantsNewTab(e)) return;
        e.preventDefault();
        openPage(service, page, recordKey);
      }}
      onAuxClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
};

/** A reference value as a link to the page of its record. */
const RefLink = ({ target, value, record, children }: { target: Target; value: unknown; record: RaRecord; children: ReactNode }) => {
  // Older servers describe direct reference links with "id", relative to the reference.
  const id = target.key === "id"
    ? value && typeof value === "object" && "id" in value ? String((value as { id: unknown }).id) : null
    : targetKey(target, record);
  if (!id) return <>{children}</>;
  return (
    <PageLink service={target.service} page={target.page} recordKey={id}>
      {children}
    </PageLink>
  );
};

/** The value of a column for a record: a field, the key, the title, a computed value, or several. */
export const ColumnValue = ({ column, record, meta, renderButtons }: {
  column: ColumnDesc; record: RaRecord; meta: RowMeta; renderButtons?: (column: ColumnDesc) => ReactNode;
}): ReactNode => {
  if (column.joined) {
    const parts = column.joined.columns
      .map((c) => ({ c, v: <ColumnValue key={c.id} column={c} record={record} meta={meta} renderButtons={renderButtons} /> }))
      .filter(({ c }) => c.buttons.length > 0 || !c.source || valueAt(record, c.source) != null);
    return (
      <>
        {parts.map(({ c, v }, i) => (
          <span key={c.id}>
            {i > 0 ? column.joined!.separator : null}
            {v}
          </span>
        ))}
        {renderButtons?.(column)}
      </>
    );
  }
  const value = column.computed
    ? meta.computed?.[column.id]
    : column.source === "id"
      ? record.id
      : column.source === "_title"
        ? meta.title
        : column.source
          ? valueAt(record, column.source)
          : undefined;
  const drawn = <Value kind={column.kind} value={value} record={record} />;
  const linked = column.link ? (
    <RefLink target={column.link} value={value} record={record}>
      {drawn}
    </RefLink>
  ) : (
    drawn
  );
  const tint = meta.cells?.[column.id];
  return (
    <Box component="span" sx={tint ? { color: `${tint}.main`, fontWeight: 500 } : undefined}>
      {column.prefix ? `${column.prefix} ` : null}
      {linked}
      {column.suffix ? ` ${column.suffix}` : null}
      {renderButtons?.(column)}
    </Box>
  );
};

export { rowMeta };
