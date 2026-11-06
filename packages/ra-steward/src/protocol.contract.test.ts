import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { targetKey } from "./context";
import type { Describe, ListAnswer, RecordPageAnswer } from "./protocol";

// Validate against protocol.ts itself, so maintaining a second runtime schema is unnecessary.
const path = fileURLToPath(new URL("./protocol.ts", import.meta.url));
const program = ts.createProgram([path], { strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022 });
const checker = program.getTypeChecker();
const source = program.getSourceFile(path)!;
const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(source)!);

const validate = (value: unknown, type: ts.Type, location: string): string | undefined => {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
  const mismatch = () => `${location}: expected ${checker.typeToString(type)}, received ${JSON.stringify(value)}`;
  if (type.isUnion()) {
    const errors = type.types.map((member) => validate(value, member, location));
    return errors.some((error) => error === undefined) ? undefined : `${location}: no union member matched (${errors.join("; ")})`;
  }
  if (type.isStringLiteral() || type.isNumberLiteral()) return value === type.value ? undefined : mismatch();
  if (type.flags & ts.TypeFlags.BooleanLiteral) return value === ((type as ts.Type & { intrinsicName: string }).intrinsicName === "true") ? undefined : mismatch();
  if (type.flags & ts.TypeFlags.String) return typeof value === "string" ? undefined : mismatch();
  if (type.flags & ts.TypeFlags.Number) return typeof value === "number" && Number.isFinite(value) ? undefined : mismatch();
  if (type.flags & ts.TypeFlags.Boolean) return typeof value === "boolean" ? undefined : mismatch();
  if (type.flags & ts.TypeFlags.Null) return value === null ? undefined : mismatch();
  if (type.flags & ts.TypeFlags.Undefined) return value === undefined ? undefined : mismatch();
  if (checker.isArrayType(type)) {
    if (!Array.isArray(value)) return mismatch();
    const item = checker.getTypeArguments(type as ts.TypeReference)[0];
    return value.map((v, i) => validate(v, item, `${location}[${i}]`)).find((error) => error !== undefined);
  }
  if (!(type.flags & ts.TypeFlags.Object)) throw new Error(`Unsupported protocol type: ${checker.typeToString(type)}`);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return mismatch();
  const object = value as Record<string, unknown>;
  const properties = checker.getPropertiesOfType(type);
  for (const property of properties) {
    if (!Object.hasOwn(object, property.name)) {
      if (!(property.flags & ts.SymbolFlags.Optional)) return `${location}.${property.name}: missing required property`;
    } else {
      const error = validate(object[property.name], checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration ?? source), `${location}.${property.name}`);
      if (error) return error;
    }
  }
  const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
  for (const [key, entry] of Object.entries(object)) {
    if (properties.some((property) => property.name === key)) continue;
    if (!index) return `${location}.${key}: unexpected property`;
    const error = validate(entry, index, `${location}.${key}`);
    if (error) return error;
  }
};

const assertProtocol = (name: string, value: unknown) => {
  const symbol = exports.find((entry) => entry.name === name);
  if (!symbol) throw new Error(`Unknown protocol type: ${name}`);
  const error = validate(value, checker.getDeclaredTypeOfSymbol(symbol), name);
  if (error) throw new Error(error);
};

describe("the protocol validator", () => {
  it("checks nested unions and rejects missing, mistyped and unexpected fields", () => {
    expect(() => assertProtocol("ActionAnswer", { message: "Done", effects: [{ type: "open", service: "shop", page: "product", key: "1" }] })).not.toThrow();
    expect(() => assertProtocol("ActionAnswer", { message: "Done" })).toThrow(/effects/);
    expect(() => assertProtocol("ActionAnswer", { message: "Done", effects: [{ type: "download", filename: "x", url: 42 }] })).toThrow(/url/);
    expect(() => assertProtocol("ActionAnswer", { message: "Done", effects: [], extra: true })).toThrow(/unexpected property/);
  });

  it("checks recursive dictionaries and optional fields", () => {
    expect(() => assertProtocol("FormErrors", { details: { city: "Required" } })).not.toThrow();
    expect(() => assertProtocol("FormErrors", { details: { city: 42 } })).toThrow(/city/);
    expect(() => assertProtocol("RowMeta", { color: "warning", computed: { any: [1, null] } })).not.toThrow();
    expect(() => assertProtocol("RowMeta", { color: "purple" })).toThrow(/color/);
  });

  it("checks recursive widgets and joined columns whose source is absent", () => {
    const widget = { type: "section", id: "section", title: "Section", widgets: [{ type: "card", id: "card", title: "Card", columns: [{ id: "0", label: "Joined", buttons: [], joined: { separator: "/", columns: [{ id: "0.0", source: "name", label: "Name", buttons: [] }] } }] }] };
    expect(() => assertProtocol("WidgetDesc", widget)).not.toThrow();
    expect(() => assertProtocol("WidgetDesc", { ...widget, widgets: [{ type: "unknown" }] })).toThrow();
  });
});

const fixturePath = process.env.STEWARD_CONTRACT_FILE;
describe.skipIf(!fixturePath)("responses generated by the backend", () => {
  const load = () => JSON.parse(readFileSync(fixturePath!, "utf8")) as Record<string, Record<string, unknown>>;
  it("matches every response category to the actual frontend types", () => {
    const fixture = load();
    const groups = { describes: "Describe", lists: "ListAnswer", records: "RecordPageAnswer", globals: "GlobalPageAnswer", initials: "InitialAnswer", actions: "ActionAnswer", errors: "ErrorAnswer" };
    for (const [group, type] of Object.entries(groups)) {
      expect(Object.keys(fixture[group]).length).toBeGreaterThan(0);
      for (const [name, response] of Object.entries(fixture[group])) {
        try { assertProtocol(type, response); } catch (error) { throw new Error(`${group}/${name}: ${String(error)}`); }
      }
    }
    expect(Object.keys(fixture.pickers).length).toBeGreaterThan(0);
    for (const response of Object.values(fixture.pickers)) for (const table of Object.values(response as Record<string, unknown>)) assertProtocol("TableDesc", table);
  });

  it("preserves picker labels, complete reference targets and card action states", () => {
    const fixture = load();
    const picker = fixture.lists["custom-picker"] as ListAnswer;
    expect(picker.meta.rows[String(picker.data[0].id)].title).toBe("far");
    const definition = fixture.describes["edges-admin"] as Describe;
    const table = definition.pages.index.widgets.find((widget) => widget.id === "index.16");
    if (table?.type !== "table") throw new Error("Missing chained reference table");
    const target = table.columns[0].link!;
    const row = (fixture.lists["chained-link"] as ListAnswer).data[0];
    expect(target.key).toBe("vault.category");
    expect(targetKey(target, row as { id: string })).toBe("00000001-0000-0000-0000-000000000001");
    const page = fixture.records["card-actions"] as RecordPageAnswer;
    expect(page.meta.cards["note.0"].actions?.enabled).toContain("ping");
    expect(page.meta.actions?.enabled).not.toContain("ping");
  });
});
