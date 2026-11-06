import { describe, expect, it } from "vitest";
import { formInitialValues, pageSizeOptions, parseDateTime, referencePageSize } from "./inputs";
import type { FormFieldDesc } from "./protocol";

const field = (name: string, input: FormFieldDesc["input"], required = true): FormFieldDesc => ({
  name, label: name, input, required, helperText: null, minLength: null, maxLength: null, minValue: null, maxValue: null,
});

describe("form and list values", () => {
  it("converts local datetime edits to UTC across winter and summer offsets", () => {
    expect(parseDateTime("2026-11-04T10:30")).toBe("2026-11-04T09:30:00.000Z");
    expect(parseDateTime("2026-07-04T10:30")).toBe("2026-07-04T08:30:00.000Z");
    expect(parseDateTime("2026-11-04T09:30:00Z")).toBe("2026-11-04T09:30:00.000Z");
    expect(parseDateTime("")).toBeNull();
    expect(parseDateTime("invalid")).toBe("invalid");
  });

  it("keeps null optional values, empty lists and false values distinct", () => {
    const fields = [field("flag", { type: "bool" }, false), field("tags", { type: "list", of: { type: "text" } }), {
      ...field("details", { type: "json" }, false), fields: [field("city", { type: "text" })],
    }];
    expect(formInitialValues(fields)).toEqual({ flag: null, tags: [], details: null });
    expect(formInitialValues(fields, { flag: false, tags: [], details: { city: "Paris" }, id: "unrelated" }))
      .toEqual({ flag: false, tags: [], details: { city: "Paris" } });
  });

  it("offers valid page sizes including custom service defaults", () => {
    expect(referencePageSize({ pageSize: 7, maxPageSize: 10 })).toBe(7);
    expect(pageSizeOptions(10, 7)).toEqual([5, 7, 10]);
    expect(pageSizeOptions(3, 3)).toEqual([3]);
    expect(pageSizeOptions(10, 50)).toEqual([5, 10]);
  });
});
