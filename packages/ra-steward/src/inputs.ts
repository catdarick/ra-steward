import type { Describe, FormFieldDesc } from "./protocol.js";

/** HTML datetime-local values are local times; the protocol carries UTC instants. */
export const parseDateTime = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

/** Defaults belong to the action's form, independently of any record displayed around it. */
export const formInitialValues = (fields: FormFieldDesc[], values: Record<string, unknown> = {}): Record<string, unknown> =>
  Object.fromEntries(fields.map((field) => {
    const value = values[field.name];
    if (field.fields) {
      return [field.name, value == null && !field.required ? null : formInitialValues(field.fields, (value ?? {}) as Record<string, unknown>)];
    }
    return [field.name, value !== undefined ? value : !field.required ? null : field.input.type === "list" ? [] : field.input.type === "bool" ? false : undefined];
  }));

export const referencePageSize = (describe?: Pick<Describe, "pageSize" | "maxPageSize">): number =>
  Math.max(1, Math.min(describe?.pageSize ?? 25, describe?.maxPageSize ?? 200));

export const pageSizeOptions = (maxPageSize: number, current: number): number[] =>
  [...new Set([5, 10, 25, 50, Math.min(current, maxPageSize)])].filter((n) => n >= 1 && n <= maxPageSize).sort((a, b) => a - b);
