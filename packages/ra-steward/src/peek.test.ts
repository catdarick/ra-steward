import { describe, expect, it } from "vitest";
import { parsePeek, withPeek } from "./peek";

describe("the panel in the URL", () => {
  it("names each page of the panel, keeping the other parameters", () => {
    const search = withPeek("?tab=2", [
      { service: "shop", page: "category", key: "c1" },
      { service: "shop", page: "sync_report", key: null },
    ]);
    expect(search).toBe("?tab=2&peek=shop/category/c1&peek=shop/sync_report");
    expect(parsePeek(search)).toEqual([
      { service: "shop", page: "category", key: "c1" },
      { service: "shop", page: "sync_report", key: null },
    ]);
  });

  it("keeps a key with slashes and spaces whole", () => {
    const pages = [{ service: "shop", page: "product", key: "a/b c?" }];
    expect(parsePeek(withPeek("", pages))).toEqual(pages);
  });

  it("leaves no parameter for a closed panel", () => {
    expect(withPeek("?peek=shop/product/1", [])).toBe("");
    expect(withPeek("?peek=shop/product/1&tab=2", [])).toBe("?tab=2");
  });
});
