// The protocol of steward services (steward's docs/protocol.md): describe and data endpoint answers.

export type Color = "primary" | "secondary" | "success" | "info" | "warning" | "error";

export interface ChoiceOption {
  value: string;
  label: string;
  color?: Color;
  icon?: string;
}

/** How a value is drawn. */
export type DisplayKind =
  | { type: "text" }
  | { type: "number"; decimals: number | null }
  | { type: "money"; currency: string; decimals: number }
  | { type: "date" }
  | { type: "datetime" }
  | { type: "bool"; yes: string; no: string }
  | { type: "choice"; options: ChoiceOption[] }
  | { type: "ref"; resource: string }
  | { type: "list"; of: DisplayKind }
  | { type: "suffixed"; suffix: string; of: DisplayKind }
  | { type: "custom"; component: string; props: unknown };

/** How a value is entered. */
export type InputKind =
  | { type: "text" }
  | { type: "textarea" }
  | { type: "number"; decimals: number | null }
  | { type: "date" }
  | { type: "datetime" }
  | { type: "bool" }
  | { type: "select"; options: ChoiceOption[] }
  | { type: "reference"; resource: string }
  | { type: "list"; of: InputKind }
  | { type: "json" };

/** The width of a page's panel or of an action's dialog: a size of MUI's, or pixels. */
export type Width = "xs" | "sm" | "md" | "lg" | "xl" | number;

export interface Target {
  service: string;
  page: string;
  /** Where the key of the record comes from: "id", a path of the row, or none. */
  key: string | null;
}

export interface Confirm {
  title: string;
  text: string;
}

export type ButtonDesc =
  | {
      kind: "action";
      action: string;
      label: string;
      icon?: string;
      color?: Color;
      hideDisabled: boolean;
      confirm: Confirm | null;
      width: Width;
    }
  | { kind: "link"; label: string; icon?: string; color?: Color; target: Target };

export interface ColumnDesc {
  id: string;
  source?: string | null;
  label: string;
  kind?: DisplayKind;
  sortBy?: string | null;
  link?: Target | null;
  buttons: ButtonDesc[];
  colored?: boolean;
  computed?: boolean;
  align?: "left" | "center" | "right";
  prefix?: string;
  suffix?: string;
  icon?: string;
  color?: Color;
  joined?: { separator: string; columns: ColumnDesc[] };
}

export interface FilterDesc {
  name: string;
  label: string;
  op: "equals" | "in" | "contains" | "at_least" | "at_most";
  input: InputKind;
}

export interface TableDesc {
  type: "table";
  id: string;
  resource: string;
  columns: ColumnDesc[];
  filters: FilterDesc[];
  initialFilters: Record<string, unknown>;
  sort: { field: string; order: "ASC" | "DESC" } | null;
  perPage: number | null;
  rowClick: Target | null;
  rowActions: ButtonDesc[];
  toolbarActions: ButtonDesc[];
  related: boolean;
}

export type WidgetDesc =
  | { type: "toolbar"; id: string; buttons: ButtonDesc[] }
  | { type: "section"; id: string; title: string; widgets: WidgetDesc[] }
  | { type: "grid"; id: string; widgets: WidgetDesc[] }
  | { type: "tabs"; id: string; tabs: { title: string; widgets: WidgetDesc[] }[] }
  | { type: "card"; id: string; title: string; columns: ColumnDesc[] }
  | { type: "component"; id: string; component: string }
  | TableDesc;

export interface PageDesc {
  name: string;
  /** The title of a page of no record; a page of a record has its record's. */
  title: string | null;
  /** The resource of the record of the page, or null. */
  record: string | null;
  /** The width of the panel it opens in. */
  panelWidth: Width;
  widgets: WidgetDesc[];
}

export type MenuEntry =
  | { type: "page"; page: string; label: string; icon?: string; color?: Color }
  | { type: "group"; label: string; icon?: string; color?: Color; items: MenuEntry[] };

export interface FormFieldDesc {
  name: string;
  label: string;
  required: boolean;
  input: InputKind;
  helperText: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  fields?: FormFieldDesc[];
}

export interface ActionDesc {
  id: string;
  record: string | null;
  label: string | null;
  icon?: string;
  color?: Color;
  confirm: Confirm | null;
  width: Width;
  form: FormFieldDesc[] | null;
}

export interface Describe {
  service: string;
  version: string;
  pageSize: number;
  maxPageSize: number;
  menu: MenuEntry[];
  pages: Record<string, PageDesc>;
  actions: Record<string, ActionDesc>;
  resources: string[];
}

/** The actions of a row or a page: enabled ones, and disabled ones with their reasons. */
export interface ActionStates {
  enabled: string[];
  disabled: Record<string, string>;
}

/** What a row needs besides its fields. */
export interface RowMeta {
  actions?: ActionStates;
  color?: Color;
  classes?: string[];
  cells?: Record<string, Color>;
  computed?: Record<string, unknown>;
  title?: string;
}

export interface ListAnswer {
  data: Record<string, unknown>[];
  total: number | null;
  hasMore: boolean;
  meta: { rows: Record<string, RowMeta>; toolbar: ActionStates };
}

export interface RecordPageAnswer {
  data: Record<string, unknown>;
  title: string;
  meta: {
    actions: ActionStates | null;
    toolbar: ActionStates;
    cards: Record<string, RowMeta>;
  };
}

export interface GlobalPageAnswer {
  title: string;
  meta: { actions: ActionStates };
}

export type Effect =
  | { type: "refresh" }
  | { type: "open"; service: string; page: string; key: unknown }
  | { type: "link"; url: string }
  | { type: "download"; url: string; filename: string }
  | { type: "close" };

export interface ActionAnswer {
  message: string;
  effects: Effect[];
}

export interface InitialAnswer {
  data: Record<string, unknown> | null;
  titles: Record<string, string | null>;
}

export interface ErrorAnswer {
  message: string;
  errors?: FormErrors;
}

/** Errors of a form, in its shape. */
export type FormErrors = { [field: string]: string | FormErrors };
